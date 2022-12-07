import * as THREE from 'three';
import { PlaybackModel } from './PlaybackModel.js';
import { VRMSchema } from '@pixiv/three-vrm';
import '@mediapipe/pose';
import '@mediapipe/hands';
import '@tensorflow/tfjs-core';
import * as poseDetection from '@tensorflow-models/pose-detection';
import * as handPoseDetection from '@tensorflow-models/hand-pose-detection';
import { Quaternion, Vector3, Matrix3, GridHelper } from 'three';
import '@tensorflow/tfjs-backend-webgl';
import '@mediapipe/pose';
import Stats from 'stats.js'
import * as dat from 'dat.gui';

import { TTFLoader } from 'three/examples/jsm/loaders/TTFLoader';
import { PlayerModel } from './PlayerModel.js';

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

            let countdown_sec = 3;
            let interval_id = setInterval(() => {
                if (countdown_sec === 0) {
                    // Track has started
                    console.log("track started");
                    renderText('Now playing "' + this.current_track.name + '"');


                    video.play();
                    playback_model.start_playback();
                    

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

var models = ['Ashtra', 'three-vrm-girl', 'VAL']
var cur_model = '/models/Ashtra.vrm';
function change_models(model) {
    cur_model = '/models/' + model + '.vrm';
    scene.clear();
    scene.add(light);
    tm.update_game_state();
    tmp_model = new PlaybackModel(cur_model, scene, new Vector3(0, 0, 0), poseMapBones);
}


// STREAM
const WEBCAM_ENABLED = true;
const WEBCAM_WIDTH = 640;
const WEBCAM_HEIGHT = 480;

var source; // video source
var tmp_model;

// GUI
const gui = new dat.GUI();
var gameplay_options = gui.addFolder('Gameplay Options');
gameplay_options.open();
var track_controller;
var model_controller;
var gui_options = {
    'Track': 'Select a Track.',
    'Play!': () => tm.play(track_controller.getValue()),
    'Stop': () => tm.stop(),
    'Model': 'Select a Model',
    'Change!' : () => change_models(model_controller.getValue()),
};
var model_options = gui.addFolder('Model Options');
//model_options.open();

model_controller = model_options.add(gui_options, 'Model', models);
model_options.add(gui_options, 'Change!');

track_controller = gameplay_options.add( gui_options, 'Track', tm.get_track_names());
gameplay_options.add( gui_options, 'Play!' );
gameplay_options.add( gui_options, 'Stop' );

const SAMPLING_INTERVAL_MS = 25; 
const FRAME_BUFFER_SIZE = 5;

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
const video = document.getElementById('playback');
console.log(video)

var renderer = new THREE.WebGLRenderer({ alpha: true });
renderer.setClearAlpha(0.0);
renderer.setSize( window.innerWidth, window.innerHeight );
document.body.appendChild( renderer.domElement );
document.body.appendChild(stats.dom)
stats.domElement.style = 'bottom:10px';

camera.position.set( 0, 1.25, -1.5 );
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


let bones_drawn = [];

// just testing the base model works
var player_model = new PlayerModel(cur_model, scene, new Vector3(1, 0, .25), poseMapBones);
var playback_model = new PlaybackModel('/models/Ashtra.vrm', scene, new Vector3(-1, 0, .25), poseMapBones);
window.addEventListener('PoseMadeEvent', (e) => { console.log(getPosesSimilarity(player_model, playback_model)); }, false);

const disp_material = new THREE.LineBasicMaterial({
    color: 0xffffff
});

function vecToScreen(v) {
    return new THREE.Vector3(v.x / window.innerWidth * 2 - 1, -(v.y / window.innerHeight * 2 - 1), -1);
}

function getPosesSimilarity(model_one, model_two) {
    var total_similar = 0
    const frame_1 = model_one.get_current_real_bones();
    const frame_2 = model_two.get_current_real_bones();
    for (const [key, value] of Object.entries(poseMapBones)) {
        const percent = frame_1[key].getTangent().angleTo(frame_2[key].getTangent()) / Math.PI;
        total_similar += percent;
    }
    return total_similar / Object.keys(poseMapBones).length;
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

var animate = function () {
    //setTimeout(function() {
        requestAnimationFrame( animate )
    //}, 100);

    stats.begin()
    const delta = clock.getDelta()
    player_model.update(delta, modelToRealMap);
    playback_model.update(delta + clock.getDelta(), modelToRealMap);
	renderer.render(scene, camera);
    stats.end()
};

animate();


window.addEventListener('DOMContentLoaded', () => { enableCam(); enableVideo(); });

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

function get_detector() {
    const body_model = poseDetection.SupportedModels.BlazePose;
    const bodyConfig = {
        runtime: 'mediapipe',
        solutionPath: 'https://cdn.jsdelivr.net/npm/@mediapipe/pose',
        modelType: 'lite'
                        // or 'base/node_modules/@mediapipe/pose' in npm.
    };
    return poseDetection.createDetector(body_model, bodyConfig);
}

// Enable the live webcam view and start classification.
function enableCam(event) {    
    // getUsermedia parameters to force video but not audio.
    const constraints = {
        video: true
    };
  
    const webcam = document.getElementById('webcam');
    webcam.width = WEBCAM_WIDTH;
    webcam.height = WEBCAM_HEIGHT;
    webcam.autoplay = true;
    // Activate the webcam stream.
    navigator.mediaDevices.getUserMedia(constraints).then(function(stream) {
        webcam.srcObject = stream;
        webcam.addEventListener('loadeddata', function() { 
            player_model.add_video(webcam);
            player_model.add_detector(get_detector());
            player_model.start_detection();
        });
    });
}

var video_ended = false;

var saved_frames = [];
function endRecording(event) {
    video.pause();
    video_ended = true;
    console.log(JSON.stringify(saved_frames));
    tm.stop();
}