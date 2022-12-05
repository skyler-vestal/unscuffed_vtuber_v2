import { BaseModel } from "./BaseModel";
import { SavedFrames, Frame } from './Bone.js';

export class PlaybackModel extends BaseModel {

    // Likely want to move/call loadSavedFrames here and store the frame buffer!
    constructor(model_file, scene, loc, frame_buffer_size = 5, sampling_interval_ms = 25, poseMapBones, modelToRealMap) {
        super(model_file, scene, loc, frame_buffer_size, sampling_interval_ms);
        this.poseMapBones = poseMapBones;
        this.modelToRealMap = modelToRealMap;
        setTimeout(() => {this.loadSavedFrames('/saved/sasuke.json')}, 1000);
    }

    async loadSavedFrames(file_dir) {
        console.log('pose_frames2: ' + this.pose_frames);
        var arr = await ((await fetch(file_dir)).json());
        this.pose_frames_saved = new SavedFrames(arr.length, this.pose_frames.init_quats, this.pose_frames.init_inv_quats);
        console.log(this.pose_frames_saved);
        for (const frame of arr) {
            this.pose_frames_saved.add(new Frame(this.poseMapBones, frame["space_points"], frame["flat_points"], frame["time"]));
        }
        console.log('finished loading frames');
    }

    // Called each time ThreeJS wants a new frame!
    // This means we should take the elapsed time to determine which frames we
    // should interpolate between, and how far between the two frames we should interpolate
    // Look at animateFromFile in index.js for the "meat" of it, though you'll likely need some new
    // variables for the frames you'll need to setup:
    // loadSavedFrames does the setup 

    

    update(delta_time, elapsed_time) {

        
        if (this.model && this.pose_frames_saved) {
            let res = this.pose_frames_saved.getInterpolatedState(elapsed_time, this.modelToRealMap);
        if (res) {
            for (const [k, v] of Object.entries(res)) {
                this.model.humanoid.getBoneNode(k).setRotationFromQuaternion(v);
            }
        }
        this.model.update(delta_time);
        }
    }
}