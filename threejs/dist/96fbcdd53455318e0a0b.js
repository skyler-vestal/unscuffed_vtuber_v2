import*as THREE from"three";import{GLTFLoader}from"three/examples/jsm/loaders/GLTFLoader.js";import{FrameBuffer,Frame,Bone}from"./Bone.js";import"@tensorflow/tfjs-backend-webgl";import*as poseDetection from"@tensorflow-models/pose-detection";import{Quaternion,Vector3,Matrix3}from"three";import{getAngleBetween3Points}from"./utils.js";const SAMPLING_INTERVAL_MS=100,FRAME_BUFFER_SIZE=500;var frames,blazePosePreviousState=null,blazePoseCurrentState=null,lastBPUpdateMs=0;const modelToBlazePoseMap={113:[2,-1,null],85:[8,1,null],86:[9,8,null],114:[3,2,null],17:[29,1,[Math.PI/2,0,0,Math.PI/10]]};var scene=new THREE.Scene,camera=new THREE.PerspectiveCamera(75,window.innerWidth/window.innerHeight,.1,1e3),renderer=new THREE.WebGLRenderer;renderer.setSize(window.innerWidth,window.innerHeight),document.body.appendChild(renderer.domElement),camera.position.set(0,1.5,-1.5),camera.lookAt(0,1,0);const light=new THREE.DirectionalLight(255,1);light.position.set(2,2,5),scene.add(light);var model,boneHelper,loader=new GLTFLoader,init_quats=[],init_inv_quats=[];loader.load("/models/peppermind.glb",(function(e){scene.background=new THREE.Color(2172201),model=e.scene,scene.add(e.scene),(boneHelper=new THREE.SkeletonHelper(model)).material.linewidth=5,boneHelper.visible=!0,console.log(boneHelper),boneHelper.bones.forEach((e=>{init_quats.push((new Quaternion).copy(e.quaternion)),init_inv_quats.push(e.getWorldQuaternion(new THREE.Quaternion).invert())})),frames=new FrameBuffer(500,init_quats,init_inv_quats,100)}),void 0,(function(e){console.error(e)}));var animate=function(){if(requestAnimationFrame(animate),frames&&model&&blazePoseCurrentState){let e=frames.getInterpolatedState((new Date).getTime()-100,modelToBlazePoseMap);if(e)for(const[t,n]of Object.entries(e))boneHelper.bones[t].setRotationFromQuaternion(n)}renderer.render(scene,camera)};animate();const video=document.getElementById("webcam");function enableCam(e){navigator.mediaDevices.getUserMedia({video:!0}).then((function(e){video.srcObject=e,video.addEventListener("loadeddata",predictWebcam)}))}var detector;async function predictWebcam(){detector=await poseDetection.createDetector(poseDetection.SupportedModels.BlazePose,{runtime:"tfjs",modelType:"lite"}),setInterval((async function(){const e=await detector.estimatePoses(video);detector&&video&&e&&e[0]&&(blazePoseCurrentState=new Frame(e[0].keypoints3D),frames&&frames.add(blazePoseCurrentState))}),100)}function slerpShort(e,t,n,o){if(o||(o=new THREE.Quaternion),n<=0)return o.xyzw=e.xyzw,o;if(n>=1)return o.xyzw=t.xyzw,o;let r=e.dot(t);const a=(new THREE.Quaternion).copy(t);let i,s;if(r<0&&(a.x=-a.x,a.y=-a.y,a.z=-a.z,a.w=-a.w,r=-r),r>.9999)i=1-n,s=0+n;else{const e=Math.sqrt(1-r*r),t=Math.atan2(e,r),o=1/e;i=Math.sin((1-n)*t)*o,s=Math.sin((0+n)*t)*o}return o.x=i*e.x+s*a.x,o.y=i*e.y+s*a.y,o.z=i*e.z+s*a.z,o.w=i*e.w+s*a.w,o}window.addEventListener("DOMContentLoaded",enableCam);