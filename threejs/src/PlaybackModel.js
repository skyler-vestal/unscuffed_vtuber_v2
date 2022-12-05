import { BaseModel } from "./BaseModel";
import { SavedFrames, Frame } from './Bone.js';

export class PlaybackModel extends BaseModel {

    // Likely want to move/call loadSavedFrames here and store the frame buffer!
    constructor(model_file, scene, loc, poseMapBones, frame_buffer_size = 5, sampling_interval_ms = 25) {
        super(model_file, scene, loc, frame_buffer_size, sampling_interval_ms);
        this.poseMapBones = poseMapBones;
    }

    async loadSavedFrames(file_dir) {
        var arr = await ((await fetch(file_dir)).json());
        this.pose_frames_saved = new SavedFrames(arr.length, this.init_quats, this.init_inv_quats);
        for (const frame of arr) {
            this.pose_frames_saved.add(new Frame(this.poseMapBones, frame["space_points"], frame["flat_points"], frame["time"]));
            console.log(this.pose_frames_saved);
        }
    }

    on_load() {
        this.loadSavedFrames('/saved/sasuke.json');
    }

    // Called each time ThreeJS wants a new frame!
    // This means we should take the elapsed time to determine which frames we
    // should interpolate between, and how far between the two frames we should interpolate
    // Look at animateFromFile in index.js for the "meat" of it, though you'll likely need some new
    // variables for the frames you'll need to setup:
    // loadSavedFrames does the setup 
    update(delta_time, modelToRealMap) {
        if (this.model) {
            if (this.pose_frames_saved) {
                let res = this.pose_frames_saved.getInterpolatedState(this.animate_init_time ? 
                    (new Date()).getTime() - this.animate_init_time : 0, modelToRealMap);
                if (!this.animate_init_time) {
                    this.animate_init_time = (new Date()).getTime();
                }
                console.log(res, (new Date()).getTime() - this.animate_init_time);
                if (res) {
                    for (const [k, v] of Object.entries(res)) {
                        this.model.humanoid.getBoneNode(k).setRotationFromQuaternion(v);
                    }
                }
            }
            this.model.update(delta_time);
        }
    }
}