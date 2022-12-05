import { BaseModel } from "./BaseModel";

export class PlayerModel extends BaseModel {

    constructor(model_file, scene, loc, frame_buffer_size = 5, sampling_interval_ms = 25) {
        super(model_file, scene, loc, frame_buffer_size, sampling_interval_ms);
    }

    update(delta_time, elapsed_time) {
        if (this.model) {
            this.model.update(deltaTime);
        }
    }
}