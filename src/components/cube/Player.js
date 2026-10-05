import { Howl, Howler } from "howler";

function createHiddenSoundButton(CB) {
  var elemm = document.createElement("button");
  elemm.style.cssText =
    "position:absolute;width:0%;height:0%;opacity:0;z-index:100;background:#000;";
  elemm.onclick = CB;
  
  return document.body.appendChild(elemm);
}

export default function Player() {
  var SwitchCube1 = new Howl({
    src: ["/sounds/SwitchCube1.mp3"],
    autoplay: true,
    // loop: true,
    volume: 0.5,
    onend: function () {
      console.log("Finished!");
    },
  });

   const SwitchCube1Click = createHiddenSoundButton(SwitchCube1.play);

console.log(SwitchCube1Click);

  

  var SwitchCube2 = new Howl({
    src: ["/sounds/SwitchCube2.mp3"],
    autoplay: true,
    // loop: true,
    volume: 0.5,
    onend: function () {
      console.log("Finished!");
    },
  });

  var soundsLib = {
    SwitchCube1: SwitchCube1Click.click,
    SwitchCube2,
  };


  return soundsLib;
}
