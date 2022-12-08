import { BaseModel } from "./BaseModel";
import { SavedFrames, Frame } from './Bone.js';

export class PlaybackModel extends BaseModel {

    // Likely want to move/call loadSavedFrames here and store the frame buffer!
    constructor(model_file, scene, loc, poseMapBones, frame_buffer_size = 5, sampling_interval_ms = 25) {
        super(model_file, scene, loc, frame_buffer_size, sampling_interval_ms);
        this.poseMapBones = poseMapBones;
        this.playing = false;
    }

    async loadSavedFrames(file_dir) {
        var arr = await ((await fetch(file_dir)).json());
        this.pose_frames_saved = new SavedFrames(arr.length, this.init_quats, this.init_inv_quats);
        for (const frame of arr) {
            this.pose_frames_saved.add(new Frame(this.poseMapBones, frame["space_points"], frame["flat_points"], frame["time"]));
        }
    }

    on_load() {
        this.loadSavedFrames('/saved/sasuke.json');
    }

    start_playback() {
        this.init_time = (new Date()).getTime();
        this.playing = true;
    }

    stop_playback() {
        this.init_time = 0;
        this.playing = false;
    }

    get_current_real_bones() {
        let frame = this.pose_frames_saved.getFrames((new Date()).getTime() - this.init_time);
        return frame[0] ? frame[0].bones : null;
    }

    // Called each time ThreeJS wants a new frame!
    // This means we should take the elapsed time to determine which frames we
    // should interpolate between, and how far between the two frames we should interpolate
    // Look at animateFromFile in index.js for the "meat" of it, though you'll likely need some new
    // variables for the frames you'll need to setup:
    // loadSavedFrames does the setup 
    update(delta_time, modelToRealMap) {
        if (this.model) {
            if (this.playing && this.pose_frames_saved) {
                let res = this.pose_frames_saved.getInterpolatedState(
                    (new Date()).getTime() - this.init_time, modelToRealMap);
                if (res) {
                    for (const [k, v] of Object.entries(res)) {
                        this.model.humanoid.getBoneNode(k).setRotationFromQuaternion(v);
                    }
                }
                let pos = this.pose_frames_saved.getInterpolatedPosition((new Date()).getTime() - this.init_time - this.sampling_interval_ms, document.getElementById('playback'));
                if (pos) {
                    this.model.scene.position.set(this.loc.x - (pos[0] * 2 - 1), 0, 0);
                }
            }
            this.model.update(delta_time);
        }
    }
}