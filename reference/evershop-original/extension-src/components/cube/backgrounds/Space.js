import {
  Scene,
  WebGLRenderer,
  PerspectiveCamera,
  Vector3,
  SplineCurve,
  Mesh,
  BoxGeometry,
  MeshBasicMaterial,
} from "three";

export default function Space() {
  // set canvas to be window dimensions
  var canvas = document.getElementById("starfield");
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
  var renderer = new WebGLRenderer({ canvas: canvas });
  var scene = new Scene();

  renderer.setSize(window.innerWidth, window.innerHeight);

  document.body.appendChild(renderer.domElement);

  var camera = new PerspectiveCamera(
    75,
    window.innerWidth / window.innerHeight,
    0.1,
    2000
  );

  var randomPoints = [];
  for (var i = 0; i < 100; i++) {
    randomPoints.push(
      new Vector3(
        Math.random() * 200 - 100,
        Math.random() * 200 - 100,
        Math.random() * 200 - 100
      )
    );
  }
  var spline = new SplineCurve(randomPoints);

  var camPosIndex = 0;
  function update() {
    renderer.render(scene, camera);
    requestAnimationFrame(update);

    camPosIndex++;
    if (camPosIndex > 10000) {
      camPosIndex = 0;
    }
    var camPos = spline.getPoint(camPosIndex / 10000);
    var camRot = spline.getTangent(camPosIndex / 10000);

    camera.position.x = camPos.x;
    camera.position.y = camPos.y;
    camera.position.z = camPos.z;

    camera.rotation.x = camRot.x;
    camera.rotation.y = camRot.y;
    camera.rotation.z = camRot.z;

    camera.lookAt(spline.getPoint((camPosIndex + 1) / 10000));
  }
  update();

  for (var i = 0; i < 400; i++) {
    var b = new Mesh(
      new BoxGeometry(1, 1, 1),
      new MeshBasicMaterial({ color: "#EEEDDD" })
    );

    b.position.x = -300 + Math.random() * 600;
    b.position.y = -300 + Math.random() * 600;
    b.position.z = -300 + Math.random() * 600;

    scene.add(b);
    console.log("Added cube");
  }

  var geometry = new BoxGeometry(1, 1, 1);
  var material = new MeshBasicMaterial({ color: 0x00ff00 });
  var cube = new Mesh(geometry, material);
  scene.add(cube);

  camera.position.z = 5;
}
