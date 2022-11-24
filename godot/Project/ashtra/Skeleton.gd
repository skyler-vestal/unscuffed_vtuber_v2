extends Skeleton


# Declare member variables here. Examples:
# var a = 2
# var b = "text"

# Called when the node enters the scene tree for the first time.
func _ready():
	set_process(true)


# Called every frame. 'delta' is the elapsed time since the previous frame.
func _process(delta):
	var t = get_bone_pose(17)
	t = t.rotated(Vector3(0.0, 1.0, 0.0), sin(delta))
	set_bone_pose(17, t)
	
