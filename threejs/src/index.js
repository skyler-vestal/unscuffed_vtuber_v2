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

const SAMPLING_INTERVAL_MS = 50; 
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


var loader = new GLTFLoader();
var model;
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

function drawBones(frame) {
    if (frame.displayBones) {
        if (drawBones.length > 0) {
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
    if (pose_frames && hand_frames && model && pose_started && hand_started) {
        let res = pose_frames.getInterpolatedState(new Date().getTime() - SAMPLING_INTERVAL_MS, modelToRealMap);
        if (res) {
            for (const [k, v] of Object.entries(res)) {
                model.humanoid.getBoneNode(k).setRotationFromQuaternion(v);
            }
        }
        drawBones(pose_frames.getLastFrame());
        res = hand_frames.getInterpolatedState(new Date().getTime() - SAMPLING_INTERVAL_MS, modelToRealMap);
        if (res) {
            for (const [k, v] of Object.entries(res)) {
                model.humanoid.getBoneNode(k).setRotationFromQuaternion(v);
            }
        }
        model.update( deltaTime );
    }
    
	renderer.render( scene, camera );
    stats.end()
};

animate();


window.addEventListener('DOMContentLoaded', enableCam);

// Enable the live webcam view and start classification.
function enableCam(event) {    
    // getUsermedia parameters to force video but not audio.
    const constraints = {
        video: true
    };
  
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
        modelType: 'full'
                        // or 'base/node_modules/@mediapipe/pose' in npm.
    };
    body_detector = await poseDetection.createDetector(body_model, bodyConfig);

    const hand_model = handPoseDetection.SupportedModels.MediaPipeHands;
    const handConfig = {
        runtime: 'mediapipe', // or 'tfjs',
        solutionPath: 'https://cdn.jsdelivr.net/npm/@mediapipe/hands',
        modelType: 'full'
    }
    hand_detector = await handPoseDetection.createDetector(hand_model, handConfig);

    setInterval(async function detectPoses() { 
        const poses = await body_detector.estimatePoses(video);     
        if (body_detector && video && poses && poses[0]) {
            // update current state
            if (pose_frames) {
                let new_frame = new Frame(poseMapBones, [poses[0].keypoints3D], [poses[0].keypoints]);
                pose_frames.add(new_frame);
                pose_started = true;
            }
        }
    }, SAMPLING_INTERVAL_MS);

    setInterval(async function detectHands() { 
        const hands = await hand_detector.estimateHands(video);
        if (hand_detector && video && hands && hands.length > 0) {
            if (hand_frames) {
                let hand_data = [];
                let hand_display_data = [];
                // only push data for hands detected
                for (let i = 0; i < hands.length && i < 2; i++) {
                    hand_data.push(hands[i].keypoints3D);
                    hand_display_data.push(hands[i].keypoints);
                    hand_data[i].handedness = hands[i].handedness;
                    hand_display_data[i].handedness = hands[i].handedness;
                    for (let j = 0; j < hand_data[i].length; j++) {
                        hand_data[i][j].score = hands[i].score;
                        hand_display_data[i][j].score = hands[i].score;
                    }
                }
                hand_frames.add(new Frame(handMapBones, hand_data));
                hand_started = true;
            }
        }
    }, SAMPLING_INTERVAL_MS);
}