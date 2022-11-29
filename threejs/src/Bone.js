import { assert } from '@tensorflow/tfjs-core/dist/util_base';
import { Vector2, Vector3, Quaternion, Matrix4, Euler, Matrix3, OneMinusDstAlphaFactor } from 'three';
import { getRotationBetweenVec, getAngleBetween3Points, clamp, negateQuatW } from './utils';
import * as THREE from 'three';
import { assertValidResolution } from '@tensorflow-models/posenet/dist/util';

const MIN_VALID_SCORE = 0.65;

// circular buffer to store skeleton state per frame
export class FrameBuffer {
    constructor(size, init_quats, init_inv_quats) {
        this.size = size;
        this.init_quats = init_quats;
        this.init_inv_quats = init_inv_quats;
        this.next_idx = 0;
        this.frames = Array(size); // circular buffer
        this.last_updated = new Object();
        for (const [k, v] of Object.entries(init_quats)) {
            this.last_updated[k] = [new Quaternion(0, 0, 0, 1), new Quaternion(0, 0, 0, 1), 0, 1];
        }
        //this.last_updated = Array(init_quats.length).fill([new Quaternion(0, 0, 0, 1), new Quaternion(0, 0, 0, 1), 0, 1]);
        this.stalling = false;
    }

    // Given a relative tangent and a current bone tangent, get the quaternion that 
    // represents the rotation between th
    getDeltaQuat(relTangent, curTangent, k, ang_data) {
        // finding axis and angle to rotate
        let axis = (new Vector3()).copy(relTangent).cross(curTangent).normalize();
        // axis = new Vector3(0, 0, 1);
        //console.log("axis: ", axis);
        //relTangent.applyAxisAngle(axis, ang);
        let ang_offset = ang_data != null ? ang_data[0] : 0;
        let angle = relTangent.angleTo(curTangent) - ang_offset;
        // console.log(angle * 180 / Math.PI);
        // console.log("angle: ", angle * (180 / Math.PI));

        // convert the axis into the bone's local space
        axis.applyQuaternion(this.init_inv_quats[k]);

        // calculate the new rotation quaternion from the relative tangent and current bone tangent
        let deltaLocalRot = new Quaternion();
        deltaLocalRot.setFromAxisAngle(axis, angle);
        if (ang_data != null) {
            let tempEuler = (new Euler()).setFromQuaternion(deltaLocalRot.normalize());
            tempEuler.z = clamp(tempEuler.z, -ang_data[3], ang_data[3]);
            deltaLocalRot.setFromEuler(tempEuler);
        }
        return (new Quaternion()).multiplyQuaternions(this.init_quats[k], deltaLocalRot).normalize();
    }

    getInterpolatedPosition(time) {
        // lerp positions
        let [f1, f2] = this.getFrames(time);
        if (f1 == null) {
            return null;
        }
        assert(f1.time < f2.time, "BAD FRAMES OH BOY");
        let t = (time - f1.time) / (f2.time - f1.time);
        // console.log("t value ", t);
        assert(t >= 0, "HOW IS T NEGATIVE TF");

        // Return dictionary that maps the boneHelper bone idx to the slerped deltaQuat to multiply by
        let hip_1 = f1.displayBones["hips"]
        let hip_2 = f2.displayBones["hips"]
        console.log(hip_1.cur[0])
        let x_1 = (hip_1.cur[0].x + hip_1.cur[1].x) / (2 * video.width);
        let y_1 = (hip_1.cur[0].y + hip_1.cur[1].y) / (2 * video.height);
        let x_2 = (hip_2.cur[0].x + hip_2.cur[1].x) / (2 * video.width);
        let y_2 = (hip_2.cur[0].y + hip_2.cur[1].y) / (2 * video.height);

        let x_c = x_1 * (1 - t) + x_2 * t;
        let y_c = y_1 * (1 - t) + y_2 * t;
        return [x_c, y_c];
    }

    // get the state of the skeleton (positions, rotations) after interpolation
    // interpolated between two frames
    getInterpolatedState(time, modelDict) {
        // lerp positions
        // slerp rotations
        let [f1, f2] = this.getFrames(time);
        if (f1 == null) {
            return null;
        }
        assert(f1.time < f2.time, "BAD FRAMES OH BOY");
        let t = (time - f1.time) / (f2.time - f1.time);
        // console.log("t value ", t);
        assert(t >= 0, "HOW IS T NEGATIVE TF");

        // Return dictionary that maps the boneHelper bone idx to the slerped deltaQuat to multiply by
        let ret = new Object();
        
        // https://stackoverflow.com/questions/1171849/finding-quaternion-representing-the-rotation-from-one-vector-to-another
        for (const [k, v] of Object.entries(modelDict)) {
            let scale = v[1].charAt(0) == '*' ? -1 : 1;
            let neg_w = v[0].charAt(0) == '-';
            let v0 = neg_w ? v[0].substring(1) : v[0];
            let v1 = scale < 0 ? v[1].substring(1) : v[1];
            if (!(v1 in f1.bones)) {
                continue;
            } 

            // Get relative and bone / bone tangents for both frames
            let relBone_f1 = f1.bones[v1];
            let curBone_f1 = f1.bones[v0];
            let relBone_f2 = f2.bones[v1];
            let curBone_f2 = f2.bones[v0];

            // If bone somehow didn't exist in previous frame, we hope it appears on the next lol
            if (relBone_f1 == null || curBone_f1 == null || relBone_f2 == null || curBone_f2 == null) {
                continue;
            }
            // If current bone contains nose (index 0), we adjust the z dir so that the vector 
            // aligns with the center of the head (for head rotation)
            // if (curBone_f2.pair.includes("nose")) {
            //     curBone_f1.cur[1].z = curBone_f1.cur[0].z;
            //     curBone_f2.cur[1].z = curBone_f2.cur[0].z;
            // }

            let significantAngle = (curBone_f1.getTangent().angleTo(curBone_f2.getTangent()) > (10 *  Math.PI/180));
            //let significantAngle = this.last_updated[k] == null ? true : (this.last_updated[k][1].angleTo(curBone_f2.getTangent()) > (10 *  Math.PI/180));
            let relTangent_f1 = relBone_f1.getTangent().multiplyScalar(scale).normalize();
            let curTangent_f1 = curBone_f1.getTangent().normalize();
            let relTangent_f2 = relBone_f2.getTangent().multiplyScalar(scale).normalize();
            let curTangent_f2 = curBone_f2.getTangent().normalize();
            // console.log("curTangent_f1: ", curTangent_f1);
            // console.log("curTangent_f2: ", curTangent_f2);
            //console.log(curBone_f1.getTangent().angleTo(curBone_f2.getTangent()) * 180 / Math.PI);
            // only push quaternions where both BlazePose bone endpoints passing the valid score threshold
            let deltaQuat_f1;
            let deltaQuat_f2;
            let cur_t;
            if (Math.min(...relBone_f1.cur_score, ...curBone_f1.cur_score, ...relBone_f2.cur_score, ...curBone_f2.cur_score) > MIN_VALID_SCORE) { 
                // console.log("in if of getDeltaQuat");
                deltaQuat_f1 = this.getDeltaQuat(relTangent_f1, curTangent_f1, k, v[2]);
                this.stalling = false;
                deltaQuat_f2 = this.getDeltaQuat(relTangent_f2, curTangent_f2, k, v[2]);
                this.last_updated[k] = [deltaQuat_f1, deltaQuat_f2, f1.time, f2.time];
                cur_t = t;
            } else {
                // console.log("in else of getDeltaQuat");
                deltaQuat_f1 = this.last_updated[k][0];
                deltaQuat_f2 = this.last_updated[k][1];
                cur_t = Math.min(1, (time - this.last_updated[k][2]) / (this.last_updated[k][3] - this.last_updated[k][2]));
                assert(t >= 0, "WHY IS T NEGATIVE");
                //ret = this.last_updated[k] ? this.last_updated[k][0] : new Quaternion(0, 0, 0, 1);
                this.stalling = true;
            }
            if (neg_w) {
                negateQuatW(deltaQuat_f1);
                negateQuatW(deltaQuat_f2);
            }
            ret[k] = (new Quaternion()).copy(deltaQuat_f1).slerp(deltaQuat_f2, cur_t);
        }
        return ret;
    }

    __mod__(idx) {
        return (idx + this.size) % this.size;
    }

    __get_idx__(time) {
        let cur_idx = this.__mod__(this.next_idx - 1);
        assert(this.frames[cur_idx] != null, "no frame data tf lol");
        //assert(this.frames[cur_idx].time > time, "Sooner than up to date frame");
        if (this.frames[cur_idx].time < time) {
            return null;
        }
        for (let i = 0; i < this.size; i++) {
            cur_idx = this.__mod__(cur_idx - 1);
            if (this.frames[cur_idx] == null) {
                return null;
            }
            if (this.frames[cur_idx].time <= time) {
                return cur_idx;
            }
        }   
        assert(false, "Never found a lesser time");
    }

    add(frame) {
        //console.log("Idx: ", this.next_idx);
        this.frames[this.next_idx] = frame;
        this.next_idx = this.__mod__(this.next_idx + 1); 
    }

    // we can round up last to the nearest interval
    // return an array [frame1, frame2] of frames that can be interpolated within
    getFrames(time) {
        var idx = this.__get_idx__(time);
        return idx ? [this.frames[idx], this.frames[this.__mod__(idx + 1)]] : [null, null];
    }

    getLastFrame() {
        const idx = this.__mod__(this.next_idx - 1);
        // potential for oldest frame in arr?
        assert(this.frames[idx] != null); 
        return this.frames[idx];
    }
}

export class Frame {
    constructor(pointMap, keypoints_arr, keypoints_2d_arr=null) {
        this.time = (new Date()).getTime(); // ms
        this.bones = new Object();
        this.displayBones = new Object();
        if (keypoints_arr !== null && keypoints_arr.length > 0) {
            keypoints_arr.forEach((keypoints, idx) => {
                let keypoints_2d = keypoints_2d_arr == null ? null : keypoints_2d_arr[idx];
                for (const [key, pts] of Object.entries(pointMap)) {
                    let f_key = key;
                    if (keypoints.handedness != null) {
                        if (keypoints.handedness == "Left") {
                            f_key = "right_" + key;
                        } else {
                            f_key = "left_" + key;
                        }
                    }
                    this.bones[f_key] = new Bone(pts, keypoints);
                    if (keypoints_2d) {
                        this.displayBones[f_key] = new Bone(pts, keypoints_2d, true);
                    }
                }});
        }
    }
}

export class Bone {
    constructor(pair, data, display=false) {
        let a_num = typeof pair[0] == 'number';
        let b_num = typeof pair[1] == 'number';
        if (a_num && b_num) {
            pair = [pair[0], pair[0], pair[1], pair[1]];
        } else {
            // weird ikik
            let new_pair = [];
            new_pair.push(a_num ? pair[0] : pair[0][0], a_num ? pair[0] : pair[0][1]);
            new_pair.push(b_num ? pair[1] : pair[1][0], b_num ? pair[1] : pair[1][1]);
            pair = new_pair;
        }
        this.pair = pair;
        let [start_1, start_2] = [data[pair[0]], data[pair[1]]];
        let [end_1, end_2] = [data[pair[2]], data[pair[3]]];
        function avg(v1, v2) {
            return new Vector3((v1["x"] + v2["x"]) / 2, -(v1["y"] + v2["y"]) / 2, (v1["z"] + v2["z"]) / 2);
        }
        function display_avg(v1, v2) {
            return new Vector3((v1["x"] + v2["x"]) / 2, (v1["y"] + v2["y"]) / 2);
        }
        if (display) {
            this.cur = [display_avg(start_1, start_2), display_avg(end_1, end_2)];
        } else {
            this.cur = [avg(start_1, start_2), avg(end_1, end_2)];
        }
        this.cur_score = [(data[pair[0]].score + data[pair[1]].score) / 2, (data[pair[2]].score + data[pair[3]].score) / 2];
    }

    getTangent() {
        return ((new Vector3()).copy(this.cur[1])).sub(this.cur[0]);
    }
}