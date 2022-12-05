import { Quaternion, SkeletonHelper } from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { VRM } from '@pixiv/three-vrm';
import { VRMSchema } from '@pixiv/three-vrm';
import { FrameBuffer, SavedFrames } from './Bone.js';

export class BaseModel {

    constructor(model_file, scene, loc, frame_buffer_size = 5, sampling_interval_ms = 25) {
        console.log('hello creating model');
        var loader = new GLTFLoader();
        this.init_quats = []
        this.init_inv_quats = []
        loader.load(
            // URL of the VRM you want to load
            model_file,
            // called when the resource is loaded
            ( gltf ) => {
                // generate a VRM instance from gltf
                VRM.from(gltf).then((vrm) => {
                    // add the loaded vrm to the scene
                    this.model = vrm;
                    this.model.scene.position.set(loc.x, loc.y, loc.z);
                    scene.add(vrm.scene);
                    this.boneHelper = new SkeletonHelper(vrm.scene);
                    for (let bone_enum in VRMSchema.HumanoidBoneName) {
                        let bone_name = VRMSchema.HumanoidBoneName[bone_enum];
                        let bone = this.model.humanoid.getBoneNode(bone_name);
                        if (bone) {
                            this.init_quats[bone_name] = (new Quaternion()).copy(bone.quaternion);
                            this.init_inv_quats[bone_name] = bone.getWorldQuaternion(new Quaternion()).invert();
                        }
                    }
        
                    this.pose_frames = new FrameBuffer(frame_buffer_size, this.init_quats, this.init_inv_quats, sampling_interval_ms)
                    console.log('pose_frames1: ' + this.pose_frames);
                    this.hand_frames = new FrameBuffer(frame_buffer_size, this.init_quats, this.init_inv_quats, sampling_interval_ms)
                    //loadSavedFrames('/saved/sasuke.json')
                } );
        
            },
            // called while loading is progressing
            (progress) => console.log('Loading model...', 100.0 * ( progress.loaded / progress.total ), '%'),
            // called when loading has errors
            (error) => console.error(error)
        );
    }

    update(delta_time, elapsed_time) {
        if (this.model) {
            this.model.update(deltaTime);
        }
    }
}