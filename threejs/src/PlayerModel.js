import { BaseModel } from "./BaseModel";
import { FrameBuffer, Frame } from './Bone.js';

export class PlayerModel extends BaseModel {
    constructor(model_file, scene, loc, poseMapBones, frame_buffer_size = 5, sampling_interval_ms = 25) {
        super(model_file, scene, loc, frame_buffer_size, sampling_interval_ms);
        this.poseMapBones = poseMapBones;
        this.event = new Event('DetectionBegun');
    }

    update(delta_time, model_to_real_map) {
        var latest_frame = null
        if (this.model) {
            if (this.pose_frames && this.pose_started) {
                let res = this.pose_frames.getInterpolatedState((new Date()).getTime() - this.init_time - this.sampling_interval_ms, model_to_real_map);
                if (res) {
                    for (const [k, v] of Object.entries(res)) {
                        this.model.humanoid.getBoneNode(k).setRotationFromQuaternion(v);
                    }
                }
                latest_frame = this.pose_frames.getLastFrame();
                let pos = this.pose_frames.getInterpolatedPosition((new Date()).getTime() - this.init_time - this.sampling_interval_ms);
                if (pos) {
                    this.model.scene.position.set(this.loc.x - (pos[0] * 2 - 1), this.loc.y - (pos[1] * 2 - 1), 0);
                }
            }
            this.model.update(delta_time);
        }
        return latest_frame;
    }

    async add_detector(detector) {
        this.detector = await detector;
    }

    on_load() {
        this.pose_frames = new FrameBuffer(this.frame_buffer_size, this.init_quats, this.init_inv_quats);
    }

    add_video(video) {
        this.video = video;
        this.video_ended = false;
    }

    start_detection() {
        const detect = this.detectPoses.bind(this);
        setInterval(() => { detect() }, this.sampling_interval_ms);
    }
    
    async detectPoses() {
        if (this.detector && this.video && !this.video_ended && this.pose_frames) {
            const poses = await this.detector.estimatePoses(this.video);
            if (this.video.paused) {
                this.video.play();
                dispatchEvent(this.event);
            }
            if (this.video && poses && poses[0]) {
                if (!this.pose_frames.frames[0]) {
                    this.init_time = (new Date()).getTime(); 
                }
                let new_frame = new Frame(this.poseMapBones, [poses[0].keypoints3D], [poses[0].keypoints], 
                    this.pose_frames.frames[0] ? (new Date()).getTime() - this.init_time : 0);
                this.pose_frames.add(new_frame);
                this.pose_started = true;
            }
        }
    }
}