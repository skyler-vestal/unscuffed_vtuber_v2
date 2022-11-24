extends Node

enum {
	CAMERA_FACING_FRONT,
	CAMERA_FACING_BACK
}

# Framework
const Graph : NativeScript = preload("framework/Graph.gdns")
const Packet : NativeScript = preload("framework/Packet.gdns")
const GPUHelper : NativeScript = preload("framework/GPUHelper.gdns")

# I/O
const CameraHelper : NativeScript = preload("io/CameraHelper.gdns")

# Classification
const Classification : NativeScript = preload("proto/Classification.gdns")
const ClassificationList : NativeScript = preload("proto/ClassificationList.gdns")
const ClassificationListCollection : NativeScript = preload("proto/ClassificationListCollection.gdns")

# Detection
const AssociatedDetection : NativeScript = preload("proto/AssociatedDetection.gdns")
const Detection : NativeScript = preload("proto/Detection.gdns")
const DetectionList : NativeScript = preload("proto/DetectionList.gdns")

# Landmark
const Landmark : NativeScript = preload("proto/Landmark.gdns")
const LandmarkList : NativeScript = preload("proto/LandmarkList.gdns")
const LandmarkListCollection : NativeScript = preload("proto/LandmarkListCollection.gdns")
const NormalizedLandmark : NativeScript = preload("proto/NormalizedLandmark.gdns")
const NormalizedLandmarkList : NativeScript = preload("proto/NormalizedLandmarkList.gdns")
const NormalizedLandmarkListCollection : NativeScript = preload("proto/NormalizedLandmarkListCollection.gdns")

# LocationData
const BoundingBox : NativeScript = preload("proto/BoundingBox.gdns")
const RelativeBoundingBox : NativeScript = preload("proto/RelativeBoundingBox.gdns")
const BinaryMask : NativeScript = preload("proto/BinaryMask.gdns")
const RelativeKeypoint : NativeScript = preload("proto/RelativeKeypoint.gdns")
const LocationData : NativeScript = preload("proto/LocationData.gdns")

# Rasterization
const Interval : NativeScript = preload("proto/Interval.gdns")
const Rasterization : NativeScript = preload("proto/Rasterization.gdns")

# Rect
const Rect : NativeScript = preload("proto/Rect.gdns")
const NormalizedRect : NativeScript = preload("proto/NormalizedRect.gdns")
