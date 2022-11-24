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
document.body.appendChild(stats.dom)

// Load model
var scene = new THREE.Scene();
var camera = new THREE.PerspectiveCamera( 75, window.innerWidth / window.innerHeight, 0.1, 1000 );

var renderer = new THREE.WebGLRenderer();
renderer.setSize( window.innerWidth, window.innerHeight );
document.body.appendChild( renderer.domElement );

camera.position.set( 0, 1.25, -1.00 );
camera.lookAt( 0, .85, 0 );

const light = new THREE.DirectionalLight(0xffffff, 1);
light.position.set(2, 2, 5);
scene.add(light);


var loader = new GLTFLoader();
var model;
var boneHelper;
var init_quats = [];
var init_inv_quats = [];

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


const clock = new THREE.Clock();

var animate = function () {
    //setTimeout( function() {
        requestAnimationFrame( animate );
    //}, 500);

    stats.begin()
    const deltaTime = clock.getDelta();
    if (pose_frames && hand_frames && model && pose_started && hand_started) {
        let res = pose_frames.getInterpolatedState(new Date().getTime() - SAMPLING_INTERVAL_MS, modelToRealMap);
        if (res) {
            for (const [k, v] of Object.entries(res)) {
                model.humanoid.getBoneNode(k).setRotationFromQuaternion(v);
            }
        }
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


// Video stream
const video = document.getElementById('webcam');
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
                let new_frame = new Frame(poseMapBones, [poses[0].keypoints3D]);
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
                // only push data for hands detected
                for (let i = 0; i < hands.length && i < 2; i++) {
                    hand_data.push(hands[i].keypoints3D);
                    hand_data[i].handedness = hands[i].handedness;
                    for (let j = 0; j < hand_data[i].length; j++) {
                        hand_data[i][j].score = hands[i].score;
                    }
                }
                hand_frames.add(new Frame(handMapBones, hand_data));
                hand_started = true;
            }
        }
    }, SAMPLING_INTERVAL_MS);
}