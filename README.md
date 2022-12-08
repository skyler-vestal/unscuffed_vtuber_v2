# (Un)scuffed Vtuber V2

## Installation

Do the following in the threejs directory:

To install:
```
$ npm install
```

To run:
```
$ npm run dev
```

If encountering the following error
```
this[kHandle] = new _Hash(algorithm, xofLen);
```
set the environment variable:
```
$ export NODE_OPTIONS=--openssl-legacy-provider
```

## Technical Document

### Overall Design

This project is a single player dance/rythm game where the player tries to match a video of someone dancing as best as possible. This process is aided by the real-time animation of models, one for the video being played that was previously saved, and one being animated in real time based on the player's movement. The goal of the game is to maximize your accuracy of matching the video as best as possible, doneso by measuring the angle in the bones between the person in the video and the player. 

### Software Architecture

This project is built using Blazepose for motion capture detection and Three.JS for the animation and game-loop implementation. The models are VRM models that use a GLTF loader to put them in Three.JS's scene. 

The original project was intended to be done through Godot using a Mediapipe build for pose detection and Godot for handling rotations. However springbone performance in Godot was pretty awful, so we switched.

### Division of Labor

Skyler:

- Building Mediapipe for Godot (GDMP)
- Framework to switch to ThreeJS
- Translation & interpolation of the model with confidence scores 
- Rotation of the hips
- Injects saved video stream
- Animates model from video stream
- Improves performance by removing hand detector
- Saves pose data from a video
- Reanimate model from pose data
- Created base model class refactor
- Refactored player into WebcamModel class
- Finished refactor of PlaybackModel class
- Adds score for songs
- Adds event for the end of a song to stop playback
- Tweaks changing of models

Daniel:

- Changes FrameBuffer class to use relative timing
- Refactored PlaybackModel class 
- Implemetation of model changing
- GUI for model changing

Caleb:

- Setup of DatGUI for UI
- Setup of audio with ThreeJS
- Adds rendered text (and sprites not used)
- Create Track class for songs
- Creates TrackManager class for user input


### Controls

The majority of controls are moving your body to the video. In addition, there is a GUI for most of the other controls, like picking a song, stopping a song, and changing models.

### Requirements

Advanced Graphics - There is an extreme amount of work in making sure the model is animated correctly in real-time, from video, and saving animation information. 


### Video

https://youtu.be/tixHdzpk25Y
