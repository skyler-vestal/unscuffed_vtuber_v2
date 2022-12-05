import { BaseModel } from "./BaseModel";

export class PlaybackModel extends BaseModel {

    // Likely want to move/call loadSavedFrames here and store the frame buffer!
    constructor(model_file, scene, loc, frame_buffer_size = 5, sampling_interval_ms = 25) {
        super(model_file, scene, loc, frame_buffer_size, sampling_interval_ms);
    }

    // Called each time ThreeJS wants a new frame!
    // This means we should take the elapsed time to determine which frames we
    // should interpolate between, and how far between the two frames we should interpolate
    // Look at animateFromFile in index.js for the "meat" of it, though you'll likely need some new
    // variables for the frames you'll need to setup:
    // loadSavedFrames does the setup 
    update(delta_time, elapsed_time) {
        if (this.model) {
            this.model.update(deltaTime);
        }
    }
}