import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { FrameBuffer, Frame, Bone, SavedFrames } from './Bone.js';
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
                

                this.update_game_state();
                return;
            }
        }
        console.log("Could not find track to play");
    }

    get_track_names() {
        return Array.from(this.tracks, t => t.name);
    }

    stop() {
        video.removeAttribute('src');
        video.pause();
        video.currentTime = 0;        

        this.current_track.stop();
        this.current_track = null;
        this.update_game_state();
    }

    update_game_state() {
        if (this.current_track) {

            video.removeChild(source);
            source.setAttribute('src', this.current_track.video_path);

            video.pause();
            video.currentTime = 0;

            video.appendChild(source);
            predictWebcam();

            let countdown_sec = 3;
            let interval_id = setInterval(() => {
                if (countdown_sec === 0) {
                    // Track has started
                    console.log("track started");
                    renderText('Now playing "' + this.current_track.name + '"');


                    video.play();
                    animate_init_time = new Date().getTime();
                    

                    this.current_track.play();
                    window.clearInterval(interval_id);
                } else {
                    renderText('Playing "' + this.current_track.name + '" in ' + countdown_sec + (countdown_sec == 1 ? " second" : " seconds"));
                    countdown_sec--;
                }
            }, 1000);
        } else {
            renderText('No current track.');
        }
    }
}

class Track {
    constructor(name, audio_path, video_path) {
        this.name = name;
        this.audio = new Audio(audio_path);
        this.video_path = video_path;
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
    new Track("Sasuke", "/music/sasuke.mp3", "/videos/sasuke.mp4")
]);

// STREAM
const WEBCAM_ENABLED = false;
var source; // video source

// GUI
const gui = new dat.GUI();
var gameplay_options = gui.addFolder('Gameplay Options');
gameplay_options.open();
var controller;
var gui_options = {
    'Track': 'Select a Track.',
    'Play!': () => tm.play(controller.getValue()),
    'Stop': () => tm.stop()
};

controller = gameplay_options.add( gui_options, 'Track', tm.get_track_names());
gameplay_options.add( gui_options, 'Play!' );
gameplay_options.add( gui_options, 'Stop' );

const SAMPLING_INTERVAL_MS = 25; 
const FRAME_BUFFER_SIZE = 5;
var pose_frames; // circular buffer of frames initialized in gltf load
var pose_frames_saved;
var hand_frames;

var pose_started = false;
var hand_started = false;
var blazePosePreviousState = null;
var blazePoseCurrentState = null;

var animate_init_time = -1;

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

manager.onLoad = () => renderText("No current track.");

const fontLoader = new THREE.FontLoader(manager);
const ttfLoader = new TTFLoader(manager);
var font;
var textMesh;
ttfLoader.load('fonts/Happiness.ttf', (json) => {
    const happinessFont = fontLoader.parse(json);
    font = happinessFont;
    console.log(font);
});
function renderText(text) { // when all resources are loaded
    if (textMesh) scene.remove(textMesh);
    const textGeometry = new THREE.TextGeometry(text, {
        height: 0,
        size: 0.1,
        font: font
    });
    const textMaterial = new THREE.MeshNormalMaterial();
    textMesh = new THREE.Mesh(textGeometry, textMaterial);
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
            loadSavedFrames('/saved/sasuke.json')
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

async function loadSavedFrames(file_dir) {
    var arr = await ((await fetch(file_dir)).json());
    pose_frames_saved = new SavedFrames(arr.length, pose_frames.init_quats, pose_frames.init_inv_quats);
    for (const frame of arr) {
        pose_frames_saved.add(new Frame(poseMapBones, frame["space_points"], frame["flat_points"], frame["time"]));
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
var init_time = (new Date()).getTime();

function animateFromStream() {
    const deltaTime = clock.getDelta();
    if (pose_frames && model && pose_started) {
        let res = pose_frames.getInterpolatedState((new Date()).getTime() - init_time - SAMPLING_INTERVAL_MS, modelToRealMap);
        if (res) {
            for (const [k, v] of Object.entries(res)) {
                model.humanoid.getBoneNode(k).setRotationFromQuaternion(v);
            }
        }
        drawBones(pose_frames.getLastFrame());
        let pos = pose_frames.getInterpolatedPosition((new Date()).getTime() - init_time - SAMPLING_INTERVAL_MS);
        if (pos) {
            model.scene.position.set(-(pos[0] * 2 - 1), -(pos[1] * 2 - 1), 0);
        }
        model.update( deltaTime );
    }
}

function animateFromFile() {
    const deltaTime = clock.getDelta();
    if (model && pose_frames_saved && animate_init_time != -1) {
        let res = pose_frames_saved.getInterpolatedState((new Date()).getTime() - animate_init_time, modelToRealMap);
        if (res) {
            for (const [k, v] of Object.entries(res)) {
                model.humanoid.getBoneNode(k).setRotationFromQuaternion(v);
            }
        }
        model.update(deltaTime);
    }
}

var animate = function () {
    //setTimeout(function() {
        requestAnimationFrame( animate )
    //}, 500);

    stats.begin()
    animateFromFile();
    //animateFromStream();
	renderer.render( scene, camera );
    stats.end()
};

animate();


window.addEventListener('DOMContentLoaded', WEBCAM_ENABLED ? enableCam : enableVideo);

function enableVideo(event) {
    // declared at top of file
    source = document.createElement('source');
    video.width = 270;
    video.height = 480;
    source.width = 270;
    source.height = 480;
    video.appendChild(source);
    video_ended = false;
    saved_frames = [];
    //predictWebcam();
}

// Enable the live webcam view and start classification.
function enableCam(event) {    
    // getUsermedia parameters to force video but not audio.
    const constraints = {
        video: true
    };
  
    video.width = 640;
    video.height = 480;
    video.autoplay = true;
    // Activate the webcam stream.
    navigator.mediaDevices.getUserMedia(constraints).then(function(stream) {
        video.srcObject = stream;
        video.addEventListener('loadeddata', predictWebcam);
    });
}

// BlazePose detection
var body_detector;
var hand_detector;
var video_ended = false;

var saved_frames = [];
function endRecording(event) {
    video.pause();
    video_ended = true;
    console.log(JSON.stringify(saved_frames));
}

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
        if (!video_ended) {
            const poses = await body_detector.estimatePoses(video); 
            if (video.paused) {
                video.play();
            }
            if (body_detector && video && poses && poses[0]) {
                // update current state
                if (pose_frames) {
                    if (!pose_frames.frames[0]) {
                        init_time = (new Date()).getTime(); 
                    }
                    // Set the time as 0 for the first frame
                    let new_frame = new Frame(poseMapBones, [poses[0].keypoints3D], [poses[0].keypoints], 
                        pose_frames.frames[0] ? (new Date()).getTime() - init_time : 0);
                    saved_frames.push({"space_points": [poses[0].keypoints3D], 
                                    "flat_points": [poses[0].keypoints], 
                                    "time": (new Date()).getTime() - init_time});
                    pose_frames.add(new_frame);
                    pose_started = true;
                }
            }
        }
    }, SAMPLING_INTERVAL_MS);
}