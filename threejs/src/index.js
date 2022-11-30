import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { FrameBuffer, Frame, Bone } from './Bone.js';
import { VRMSchema } from '@pixiv/three-vrm';
import { VRM } from '@pixiv/three-vrm';
import '@mediapipe/pose';
import '@mediapipe/hands';
import '@tensorflow/tfjs-core';
import * as poseDetection from '@tensorflow-models/pose-detection';
import * as handPoseDetection from '@tensorflow-models/hand-pose-detection';
import { Quaternion, Vector3, Matrix3 } from 'three';
import '@tensorflow/tfjs-backend-webgl';
import '@mediapipe/pose';
import Stats from 'stats.js'
import { meshgrid } from '@tensorflow/tfjs-core';
import * as dat from 'dat.gui';

import { TTFLoader } from 'three/examples/jsm/loaders/TTFLoader';

class TrackManager {
    constructor(tracks) {
        this.tracks = tracks;
        this.current_track = null;
    }

    play(track_name) {
        if (this.current_track) this.current_track.stop();

        for (let i = 0; i < this.tracks.length; i++) {
            if (track_name === this.tracks[i].name) {
                this.current_track = this.tracks[i];
                this.current_track.play();

                console.log("Now playing " + track_name);
                return;
            }
        }
        console.log("Could not find track to play");
    }

    get_track_names() {
        return Array.from(this.tracks, t => t.name);
    }
}

class Track {
    constructor(name, audio_path) {
        this.name = name;
        this.audio = new Audio(audio_path);
    }

    play() {
        this.audio.play();
    }

    stop() {
        this.audio.pause();
        this.audio.currentTime = 0;
    }
}

var tm = new TrackManager([
    // Add new tracks here.
    // new Track("Your track name", "relative/path/in/static/resources/directory")
    new Track("Sasuke", "/music/sasuke.mp3")
]);

// STREAM
const WEBCAM_ENABLED = true;

// GUI
const gui = new dat.GUI();
var gameplay_options = gui.addFolder('Gameplay Options');
gameplay_options.open();
var controller;
var gui_options = {
    'Track': 'Select a Track.',
    'Play!': function () {
        tm.play(controller.getValue())
    }
};

controller = gameplay_options.add( gui_options, 'Track', tm.get_track_names());

gameplay_options.add( gui_options, 'Play!' );

const SAMPLING_INTERVAL_MS = 25; 
const FRAME_BUFFER_SIZE = 500;
var pose_frames; // circular buffer of frames initialized in gltf load
var hand_frames;

var pose_started = false;
var hand_started = false;
var blazePosePreviousState = null;
var blazePoseCurrentState = null;

// Time (ms) of last blazepose update
var lastBPUpdateMs = 0;

const poseMapBones = {
    "left_up_arm": [11, 13],
    "left_low_arm": [13, 15],
    "right_up_arm": [12, 14],
    "right_low_arm": [14, 16],
    "collarbone": [11, 12],
    "neck": [[11, 12], 0],
    "left_hand": [16, [18, 20]],
    "right_hand": [15, [17, 19]],
    "left_side": [12, 24],
    "left_up_leg": [24, 26],
    "right_side": [11, 23],
    "right_up_leg": [23, 25],
    "left_low_leg": [26, 28],
    "right_low_leg": [25, 27],
    "hips": [23, 24],
}

const handMapBones = {
    "index_palm": [0, 5],
    "index_one": [5, 6],
    "index_two": [6, 7],
    "index_three": [7, 8]
}

// key: model bone
// value: [blazepose index in bone array (Bone.js), relTan, rotation of relTangent]
const modelToRealMap = {
    [VRMSchema.HumanoidBoneName.RightUpperArm]: ["left_up_arm", "*collarbone", null],  // real left arm
    [VRMSchema.HumanoidBoneName.LeftUpperArm]: ["right_up_arm", "collarbone", null], // real right arm
    [VRMSchema.HumanoidBoneName.LeftLowerArm]: ["right_low_arm", "right_up_arm", null], // real right elbow
    [VRMSchema.HumanoidBoneName.RightLowerArm]: ["left_low_arm", "left_up_arm", null], // real left elbow
    [VRMSchema.HumanoidBoneName.Neck] : ["neck", "collarbone", [Math.PI / 2, 0, 0, Math.PI / 10]], // head
    [VRMSchema.HumanoidBoneName.Hips] : ["hips", "right_side", [Math.PI / 2, 0, 0, Math.PI / 10]], // hips
    // [VRMSchema.HumanoidBoneName.RightHand]: ["left_hand", "left_low_arm", null], // left hand
    // [VRMSchema.HumanoidBoneName.LeftHand]: ["right_hand", "right_low_arm", null], // right hand
    // [VRMSchema.HumanoidBoneName.RightIndexProximal]: ["-left_index_one", "left_index_palm", null],
    // [VRMSchema.HumanoidBoneName.RightIndexIntermediate]: ["-left_index_two", "left_index_one", null],
    // [VRMSchema.HumanoidBoneName.RightIndexDistal]: ["-left_index_three", "left_index_two", null],
    [VRMSchema.HumanoidBoneName.LeftUpperLeg] : ["left_up_leg", "left_side", null], // head
    [VRMSchema.HumanoidBoneName.RightUpperLeg] : ["right_up_leg", "right_side", null], // head
    [VRMSchema.HumanoidBoneName.LeftLowerLeg] : ["left_low_leg", "left_up_leg", null], // head
    [VRMSchema.HumanoidBoneName.RightLowerLeg] : ["right_low_leg", "right_up_leg", null], // head
}

const stats = new Stats()
stats.showPanel(0)

// Load model
var scene = new THREE.Scene();
var camera = new THREE.PerspectiveCamera( 75, window.innerWidth / window.innerHeight, 0.1, 1000 );

// Video stream
const video = document.getElementById('video');
console.log(video)

var renderer = new THREE.WebGLRenderer({ alpha: true });
renderer.setClearAlpha(0.0);
renderer.setSize( window.innerWidth, window.innerHeight );
document.body.appendChild( renderer.domElement );
document.body.appendChild(stats.dom)
stats.domElement.style = 'bottom:10px';

camera.position.set( 0, 1.25, -1.00 );
camera.lookAt( 0, .90, 0 );

const light = new THREE.DirectionalLight(0xffffff, 1);
light.position.set(2, 2, 5);
scene.add(light);

// race condition, need to wait for the things to finish loading
var manager = new THREE.LoadingManager();  

manager.onLoad = () => renderFont();

// TODO: make sprites to represent certain poses 
var map = new THREE.TextureLoader().load( "./hamtaro.png" );
var material = new THREE.SpriteMaterial( { map: map, color: 0xffffff } );
var sprite = new THREE.Sprite( material );
sprite.translateX(1);
scene.add( sprite );

// approaching pose
setInterval(() => sprite.translateX(0.001), 1);  

const fontLoader = new THREE.FontLoader(manager);
const ttfLoader = new TTFLoader(manager);
var font;
ttfLoader.load('fonts/Happiness.ttf', (json) => {
    const happinessFont = fontLoader.parse(json);
    font = happinessFont;
    console.log(font);
});

function renderFont() { // when all resources are loaded
    console.log(font);
    const textGeometry = new THREE.TextGeometry('No current track.', {
        height: 0,
        size: 0.1,
        font: font
    });
    const textMaterial = new THREE.MeshNormalMaterial();
    const textMesh = new THREE.Mesh(textGeometry, textMaterial);
    textMesh.scale.x = -1;
    textMesh.position.x = 1.2;
    textMesh.position.y = 0;
    scene.add(textMesh);
}

// load different poses
var loader = new GLTFLoader();
var model;
var player;
var boneHelper;
var init_quats = [];
var init_inv_quats = [];
let bones_drawn = [];

loader.load(

	// URL of the VRM you want to load
	'/models/Ashtra.vrm',

	// called when the resource is loaded
	( gltf ) => {

		// generate a VRM instance from gltf
		VRM.from( gltf ).then( ( vrm ) => {

			// add the loaded vrm to the scene
            model = vrm;

			scene.add( vrm.scene );
            boneHelper = new THREE.SkeletonHelper( vrm.scene );
            console.log(boneHelper);

			// deal with vrm features
			console.log( vrm );

            for (let bone_enum in VRMSchema.HumanoidBoneName) {
                let bone_name = VRMSchema.HumanoidBoneName[bone_enum];
                let bone = model.humanoid.getBoneNode(bone_name);
                // is this fine?
                if (bone) {
                    init_quats[bone_name] = (new Quaternion()).copy(bone.quaternion);
                    init_inv_quats[bone_name] = bone.getWorldQuaternion(new THREE.Quaternion()).invert();
                }
            }

            pose_frames = new FrameBuffer(FRAME_BUFFER_SIZE, init_quats, init_inv_quats, SAMPLING_INTERVAL_MS)
            hand_frames = new FrameBuffer(FRAME_BUFFER_SIZE, init_quats, init_inv_quats, SAMPLING_INTERVAL_MS)
		} );

	},
	// called while loading is progressing
	( progress ) => console.log( 'Loading model...', 100.0 * ( progress.loaded / progress.total ), '%' ),
	// called when loading has errors
	( error ) => console.error( error )
);


const disp_material = new THREE.LineBasicMaterial({
    color: 0xffffff
});

function vecToScreen(v) {
    return new THREE.Vector3(v.x / window.innerWidth * 2 - 1, -(v.y / window.innerHeight * 2 - 1), -1);
}

function translateModel(frame) {
    if (frame.displayBones) {
        let hips = frame.displayBones["hips"]
        if (x && y) {
            model.scene.position.set(-(x * 2 - 1), -(y * 2 - 1), 0);
            //model.position.setX(x * 2 - 1);
            //model.position.setY(y * 2 - 1);
        }
    }
}

function drawBones(frame) {
    if (frame.displayBones) {
        if (bones_drawn.length > 0) {
            scene.remove(...bones_drawn);
        }
        for (const [key, bone] of Object.entries(frame.displayBones)) {
            if (Math.min(...bone.cur_score) > .65) { 
                // draw on near plane
                const v1 = vecToScreen(bone.cur[0]).unproject(camera);
                const v2 = vecToScreen(bone.cur[1]).unproject(camera);
                const geometry = new THREE.BufferGeometry().setFromPoints([v1, v2]);
                const line = new THREE.Line( geometry, disp_material );
                bones_drawn.push(line);
                scene.add(line);
            }
        }
    }
}

const clock = new THREE.Clock();

var animate = function () {
    // setTimeout( function() {
        requestAnimationFrame( animate );
    // }, 500);

    stats.begin()
    const deltaTime = clock.getDelta();
    if (pose_frames && model && pose_started) {
        let res = pose_frames.getInterpolatedState(new Date().getTime() - SAMPLING_INTERVAL_MS, modelToRealMap);
        if (res) {
            for (const [k, v] of Object.entries(res)) {
                model.humanoid.getBoneNode(k).setRotationFromQuaternion(v);
            }
        }
        drawBones(pose_frames.getLastFrame());
        let pos = pose_frames.getInterpolatedPosition(new Date().getTime() - SAMPLING_INTERVAL_MS);
        if (pos) {
            model.scene.position.set(-(pos[0] * 2 - 1), -(pos[1] * 2 - 1), 0);
        }
        model.update( deltaTime );
    }
    
	renderer.render( scene, camera );
    stats.end()
};

animate();


window.addEventListener('DOMContentLoaded', WEBCAM_ENABLED ? enableCam : enableVideo);

function enableVideo(event) {
    //video.addEventListener('loadeddata', predictWebcam);
    var source = document.createElement('source');
    source.setAttribute('src', '/videos/sasuke.mp4');
    video.width = 270;
    video.height = 480;
    source.width = 270;
    source.height = 480;
    video.appendChild(source);
    //video.play();
    predictWebcam();
}

// Enable the live webcam view and start classification.
function enableCam(event) {    
    // getUsermedia parameters to force video but not audio.
    const constraints = {
        video: true
    };
  
    video.width = 640;
    video.height = 480;
    //video.autoplay = true;
    // Activate the webcam stream.
    navigator.mediaDevices.getUserMedia(constraints).then(function(stream) {
        video.srcObject = stream;
        video.addEventListener('loadeddata', predictWebcam);
    });
}

// BlazePose detection
var body_detector;
var hand_detector;
async function predictWebcam() {
    const body_model = poseDetection.SupportedModels.BlazePose;
    const bodyConfig = {
        runtime: 'mediapipe',
        solutionPath: 'https://cdn.jsdelivr.net/npm/@mediapipe/pose',
        modelType: 'lite'
                        // or 'base/node_modules/@mediapipe/pose' in npm.
    };
    body_detector = await poseDetection.createDetector(body_model, bodyConfig);

    setInterval(async function detectPoses() { 
        const poses = await body_detector.estimatePoses(video);  
        if (video.paused) {
            video.play();
        }
        if (body_detector && video && poses && poses[0]) {
            // update current state
            if (pose_frames) {
                let new_frame = new Frame(poseMapBones, [poses[0].keypoints3D], [poses[0].keypoints]);
                pose_frames.add(new_frame);
                pose_started = true;
            }
        }
    }, SAMPLING_INTERVAL_MS);
}