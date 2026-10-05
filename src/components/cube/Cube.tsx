import React, { useEffect } from "react";
import { Howl, Howler } from "howler";
import {
  randomIntFromInterval,
  appendVideo,
  setFade,
  resetVideo,
  getYearsDay,
} from "../helper.js";

import dailyPasses from "../../config/dailyPass.json";

import "./ScriptLoader.js";
import { track } from "../../analytics";
import { initMystery, mysteryStep } from "./mystery";

import "./CubeStyle.scss";

import Fire from "./backgrounds/Pixi.js";
import Stars from "./backgrounds/Stars.js";
import Space from "./backgrounds/Space.js";

console.log(dailyPasses[getYearsDay()]);

let CubeBehave = {
  // code: 0,
  win: false,
  maxSteps: 4,
  maxRounds: 6,
  round: 0,
  currentStep: 0,
  records: [[]],
  codeTypes: ["numbers", "symbols", "events", "luck"],
  dailyPass: dailyPasses[getYearsDay()],
  codes: {
    numbers: ["1", "2", "3", "4", "5", "6"],
    symbols: ["♠", "∑", "♖", "♘", "♕", "🀀", "▲"],
    events: ["☽", "☾"],
    luck: ["♔"],
  },
};

function runCubeBehave() {
  const tipCubClosed = randomIntFromInterval(0, 2);
  const randomTip2 = randomIntFromInterval(0, 1);
  const randomTip3 = randomIntFromInterval(0, 2);

  switch (CubeBehave.round) {
    case 0:
      switch (CubeBehave.currentStep) {
        case tipCubClosed:
          removeOpacutyCube();
          break;
        default:
          break;
      }

      break;

    case 1:
      switch (CubeBehave.currentStep) {
        case tipCubClosed:
          shuffleCube();
          break;
        default:
          break;
      }

      break;

    case 2:
      switch (CubeBehave.currentStep) {
        case tipCubClosed:
          shuffleCube();
          break;
        default:
          break;
      }

      break;

    case 3:
      checkWin();
      openWallpaper();

      break;
    default:
      break;
  }
}

function getCodeType(code) {
  let codeType = "number";
  CubeBehave.codeTypes.forEach((type) => {
    if (CubeBehave.codes[type].includes(code)) {
      codeType = type;
    }
  });
  return codeType;
}

function initStars() {
  Stars.init();
  Stars.animate();
}

function removeOpacutyCube() {
  new Howl({
    src: ["/sounds/CubeLocked.mp3"],
    autoplay: true,
    // loop: true,
    volume: 0.4,
  }).play();

  var sides = document.getElementsByClassName("cube-side");
  for (let i = 0; i < sides.length; i++) {
    sides[i].style.backgroundColor = "black";
    sides[i].style.opacity = 1;
  }
}

function shuffleCube() {
  new Howl({
    src: ["/sounds/ShuffleCube.mp3"],
    autoplay: true,
    // loop: true,
    volume: 0.4,
  }).play();

  var sides = document.getElementsByClassName("cube-image");

  var intervalID = setInterval(() => {
    var categoryNumber = randomIntFromInterval(
      0,
      CubeBehave.codeTypes.length - 1
    );
    var category = CubeBehave.codeTypes[categoryNumber];

    for (let i = 0; i < sides.length; i++) {
      sides[i].innerHTML =
        CubeBehave.codes[category][
          randomIntFromInterval(0, CubeBehave.codes[category].length - 1)
        ];
    }
  }, 20);

  setTimeout(() => {
    clearInterval(intervalID);
    const array: string[] = [];

    for (let i = 0; i < sides.length; i++) {
      var categoryNumber = randomIntFromInterval(
        0,
        CubeBehave.codeTypes.length - 1
      );
      var category = CubeBehave.codeTypes[categoryNumber];

      var value =
        CubeBehave.codes[category][
          randomIntFromInterval(0, CubeBehave.codes[category].length - 1)
        ];
      if (!array.includes(value)) {
        array.push(value);
        sides[i].innerHTML = value;
      } else {
        i--;
      }
    }

    const arrayNum: string[] = [];
    let random = randomIntFromInterval(2, sides.length - 1);

    while (random > 0) {
      let tip = randomIntFromInterval(0, CubeBehave.codes.numbers.length - 1);
      // let take = randomIntFromInterval(0, sides.length - 1);

      if (!arrayNum.includes(CubeBehave.codes.numbers[tip])) {
        arrayNum.push(CubeBehave.codes.numbers[tip]);
        sides[tip].innerHTML = CubeBehave.codes.numbers[tip];
        random--;
      }
    }
  }, 350);
}

function shuffleActiveCube() {
  new Howl({
    src: ["/sounds/ShuffleCubeCodeActive.mp3"],
    autoplay: true,
    // loop: true,
    volume: 0.4,
  }).play();

  var sides = document.getElementsByClassName("cube-image");
  const curentSideColor = sides[0].parentNode.style.backgroundColor;

  let intervalID = setInterval(() => {
    let newActive = randomIntFromInterval(0, sides.length - 1);
    let currentActive = 0;

    for (let i = 0; i < sides.length; i++) {
      if (sides[i].classList.contains("active")) {
        currentActive = i;
      }
      sides[i].classList.remove("active");
    }

    while (newActive == currentActive) {
      newActive = randomIntFromInterval(0, sides.length - 1);
    }

    sides[newActive].classList.add("active");
    sides[currentActive].parentNode.style.backgroundColor = curentSideColor;
    sides[newActive].parentNode.style.backgroundColor = "white";

    var codeInput = window.document.getElementById("cube-code-active");
    if (codeInput) {
      codeInput.innerHTML = sides[newActive].innerHTML;
    }
  }, 12);

  setTimeout(() => {
    clearInterval(intervalID);

    for (let i = 0; i < sides.length; i++) {
      sides[i].parentNode.style.backgroundColor = curentSideColor;
    }
  }, 450);
}

function shakeCube() {
  const cube = document.getElementById("shakeCube");
  const intervalId = setInterval(() => {
    //cube.style.margin = "0 auto";

    let randomOffset = randomIntFromInterval(10, 35);
    let randomType = randomIntFromInterval(0, 1);
    let randomSide = randomIntFromInterval(0, 3);

    debugger;

    if (randomType == 0) {
      randomOffset = randomOffset * -1;
    }

    if (randomSide == 0) {
      cube.style.margin = "0 auto " + randomOffset;
    }

    if (randomSide == 1) {
      cube.style.margin = randomOffset + " auto 0";
    }

    if (randomSide == 2) {
      cube.style.paddingTop = randomOffset;
    }

    if (randomSide == 3) {
      cube.style.paddingBottom = randomOffset;
    }
  }, 50);

  setTimeout(() => {
    clearInterval(intervalId);
    cube.style.margin = "0 auto";
    cube.style.paddingTop = "0";
    cube.style.paddingBottom = "0";
  }, 200);
}

function openWallpaper() {
  let wallUp = document.getElementById("wallUp");
  let wallDown = document.getElementById("wallDown");

  let tip = 0;

  let intervalID = setInterval(() => {
    tip = tip + 10;
    wallUp.style.marginTop = tip + "px";
    wallDown.style.marginBottom = tip + "px";
  }, 2);

  setTimeout(() => {
    clearInterval(intervalID);
  }, 500);
}

function checkWin() {
  let dailyPass = CubeBehave.dailyPass.split("");
  dailyPass.forEach((el) => {
    for (let i = 0; i < CubeBehave.records.length - 1; i++) {
      let place1 = 0;
      let place2 = 0;

      for (let k = 0; k < CubeBehave.records[i].length - 1; k++) {
        if (CubeBehave.records[i][k] == dailyPass[0]) {
          place1 = k;
          break;
        }
      }

      for (let s = place1 + 1; s < CubeBehave.records[i].length - 1; s++) {
        if (CubeBehave.records[i][s] == dailyPass[1]) {
          place2 = s;
          break;
        }
      }
      if (place2 > place1) {
        CubeBehave.win = true;
      }
    }
  });
}

Howler.autoUnlock = true;

// Howler only unlocks audio on "click", but spinning the cube is a drag, which
// never fires a click, so the game stayed silent. Resume the AudioContext on the
// first press instead (mousedown/touchstart count as a user gesture).
function unlockAudioOnPress() {
  if (Howler.ctx && Howler.ctx.state !== "running") {
    Howler.ctx.resume();
  }
}
["pointerdown", "mousedown", "touchstart", "keydown"].forEach((type) =>
  window.addEventListener(type, unlockAudioOnPress, { capture: true })
);

export default function Cube() {
  useEffect(() => {
    var events = new Events();
    events.add = function (obj) {
      obj.events = {};
    };
    events.implement = function (fn) {
      fn.prototype = Object.create(Events.prototype);
    };

    function Events() {
      this.events = {};
    }
    Events.prototype.on = function (name, fn) {
      var events = this.events[name];
      if (events == undefined) {
        this.events[name] = [fn];
        this.emit("event:on", fn);
      } else {
        if (events.indexOf(fn) == -1) {
          events.push(fn);
          this.emit("event:on", fn);
        }
      }
      return this;
    };
    Events.prototype.once = function (name, fn) {
      var events = this.events[name];
      fn.once = true;
      if (!events) {
        this.events[name] = [fn];
        this.emit("event:once", fn);
      } else {
        if (events.indexOf(fn) == -1) {
          events.push(fn);
          this.emit("event:once", fn);
        }
      }
      return this;
    };
    Events.prototype.emit = function (name, args) {
      var events = this.events[name];
      if (events) {
        var i = events.length;
        while (i--) {
          if (events[i]) {
            events[i].call(this, args);
            if (events[i].once) {
              delete events[i];
            }
          }
        }
      }
      return this;
    };
    Events.prototype.unbind = function (name, fn) {
      if (name) {
        var events = this.events[name];
        if (events) {
          if (fn) {
            var i = events.indexOf(fn);
            if (i != -1) {
              delete events[i];
            }
          } else {
            delete this.events[name];
          }
        }
      } else {
        delete this.events;
        this.events = {};
      }
      return this;
    };

    var userPrefix;

    var prefix = (function () {
      var styles = window.getComputedStyle(document.documentElement, ""),
        pre = (Array.prototype.slice
          .call(styles)
          .join("")
          .match(/-(moz|webkit|ms)-/) ||
          (styles.OLink === "" && ["", "o"]))[1],
        dom = "WebKit|Moz|MS|O".match(new RegExp("(" + pre + ")", "i"))[1];
      userPrefix = {
        dom: dom,
        lowercase: pre,
        css: "-" + pre + "-",
        js: pre[0].toUpperCase() + pre.substr(1),
      };
    })();

    function bindEvent(element, type, handler) {
      if (element.addEventListener) {
        element.addEventListener(type, handler, false);
      } else {
        element.attachEvent("on" + type, handler);
      }
    }

    function Viewport(data) {
      events.add(this);

      var self = this;

      this.element = data.element;
      this.fps = data.fps;
      this.sensivity = data.sensivity;
      this.sensivityFade = data.sensivityFade;
      this.touchSensivity = data.touchSensivity;
      this.speed = data.speed;

      this.lastX = 0;
      this.lastY = 0;
      this.mouseX = 0;
      this.mouseY = 0;
      this.distanceX = 0;
      this.distanceY = 0;
      this.positionX = 1122;
      this.positionY = 136;
      this.torqueX = 0;
      this.torqueY = 0;

      this.down = false;
      this.upsideDown = false;

      this.previousPositionX = 0;
      this.previousPositionY = 0;

      this.currentSide = 0;
      this.calculatedSide = 0;

      bindEvent(document, "mousedown", function () {
        self.down = true;
      });

      bindEvent(document, "mouseup", function () {
        self.down = false;
      });

      bindEvent(document, "keyup", function () {
        self.down = false;
      });

      bindEvent(document, "mousemove", function (e) {
        self.mouseX = e.pageX;
        self.mouseY = e.pageY;
      });

      bindEvent(document, "touchstart", function (e) {
        self.down = true;
        e.touches ? (e = e.touches[0]) : null;
        self.mouseX = e.pageX / self.touchSensivity;
        self.mouseY = e.pageY / self.touchSensivity;
        self.lastX = self.mouseX;
        self.lastY = self.mouseY;
      });

      bindEvent(document, "touchmove", function (e) {
        if (e.preventDefault) {
          e.preventDefault();
        }

        if (e.touches.length == 1) {
          e.touches ? (e = e.touches[0]) : null;

          self.mouseX = e.pageX / self.touchSensivity;
          self.mouseY = e.pageY / self.touchSensivity;
        }
      });

      bindEvent(document, "touchend", function (e) {
        self.down = false;
      });

      setInterval(this.animate.bind(this), this.fps);
    }
    events.implement(Viewport);
    Viewport.prototype.animate = function () {
      this.distanceX = this.mouseX - this.lastX;
      this.distanceY = this.mouseY - this.lastY;

      this.lastX = this.mouseX;
      this.lastY = this.mouseY;

      if (this.down) {
        this.torqueX =
          this.torqueX * this.sensivityFade +
          (this.distanceX * this.speed - this.torqueX) * this.sensivity;
        this.torqueY =
          this.torqueY * this.sensivityFade +
          (this.distanceY * this.speed - this.torqueY) * this.sensivity;
      }

      if (Math.abs(this.torqueX) > 1.0 || Math.abs(this.torqueY) > 1.0) {
        if (!this.down) {
          this.torqueX *= this.sensivityFade;
          this.torqueY *= this.sensivityFade;
        }

        this.positionY -= this.torqueY;

        if (this.positionY > 360) {
          this.positionY -= 360;
        } else if (this.positionY < 0) {
          this.positionY += 360;
        }

        if (this.positionY > 90 && this.positionY < 270) {
          this.positionX -= this.torqueX;

          if (!this.upsideDown) {
            this.upsideDown = true;
            this.emit("upsideDown", { upsideDown: this.upsideDown });
          }
        } else {
          this.positionX += this.torqueX;

          if (this.upsideDown) {
            this.upsideDown = false;
            this.emit("upsideDown", { upsideDown: this.upsideDown });
          }
        }

        if (this.positionX > 360) {
          this.positionX -= 360;
        } else if (this.positionX < 0) {
          this.positionX += 360;
        }

        if (
          !(this.positionY >= 46 && this.positionY <= 130) &&
          !(this.positionY >= 220 && this.positionY <= 308)
        ) {
          if (this.upsideDown) {
            if (this.positionX >= 42 && this.positionX <= 130) {
              this.calculatedSide = 3;
            } else if (this.positionX >= 131 && this.positionX <= 223) {
              this.calculatedSide = 2;
            } else if (this.positionX >= 224 && this.positionX <= 314) {
              this.calculatedSide = 5;
            } else {
              this.calculatedSide = 4;
            }
          } else {
            if (this.positionX >= 42 && this.positionX <= 130) {
              this.calculatedSide = 5;
            } else if (this.positionX >= 131 && this.positionX <= 223) {
              this.calculatedSide = 4;
            } else if (this.positionX >= 224 && this.positionX <= 314) {
              this.calculatedSide = 3;
            } else {
              this.calculatedSide = 2;
            }
          }
        } else {
          if (this.positionY >= 46 && this.positionY <= 130) {
            this.calculatedSide = 6;
          }

          if (this.positionY >= 220 && this.positionY <= 308) {
            this.calculatedSide = 1;
          }
        }

        if (this.calculatedSide !== this.currentSide) {
          this.currentSide = this.calculatedSide;
          this.emit("sideChange");
        }
      }

      this.element.style[userPrefix.js + "Transform"] =
        "rotateX(" + this.positionY + "deg) rotateY(" + this.positionX + "deg)";

      if (
        this.positionY != this.previousPositionY ||
        this.positionX != this.previousPositionX
      ) {
        this.previousPositionY = this.positionY;
        this.previousPositionX = this.positionX;

        this.emit("rotate");
      }
    };
    var viewport = new Viewport({
      element: document.getElementsByClassName("cube")[0],
      fps: 20,
      sensivity: 0.1,
      sensivityFade: 0.93,
      speed: 2,
      touchSensivity: 1.5,
    });

    function Cube(data) {
      var self = this;

      this.element = data.element;
      this.sides = this.element.getElementsByClassName("side");

      this.viewport = data.viewport;
      this.viewport.on("rotate", function () {
        self.rotateSides();
      });
      this.viewport.on("upsideDown", function (obj) {
        self.upsideDown(obj);
      });
      this.viewport.on("sideChange", function () {
        self.sideChange();
      });
    }
    Cube.prototype.rotateSides = function () {
      var viewport = this.viewport;
      if (viewport.positionY > 90 && viewport.positionY < 270) {
        this.sides[0].getElementsByClassName("cube-image")[0].style[
          userPrefix.js + "Transform"
        ] = "rotate(" + (viewport.positionX + viewport.torqueX) + "deg)";
        this.sides[5].getElementsByClassName("cube-image")[0].style[
          userPrefix.js + "Transform"
        ] = "rotate(" + -(viewport.positionX + 180 + viewport.torqueX) + "deg)";
      } else {
        this.sides[0].getElementsByClassName("cube-image")[0].style[
          userPrefix.js + "Transform"
        ] = "rotate(" + (viewport.positionX - viewport.torqueX) + "deg)";
        this.sides[5].getElementsByClassName("cube-image")[0].style[
          userPrefix.js + "Transform"
        ] = "rotate(" + -(viewport.positionX + 180 - viewport.torqueX) + "deg)";
      }
    };
    Cube.prototype.upsideDown = function (obj) {
      var deg = obj.upsideDown == true ? "180deg" : "0deg";
      var i = 5;

      while (i > 0 && --i) {
        this.sides[i].getElementsByClassName("cube-image")[0].style[
          userPrefix.js + "Transform"
        ] = "rotate(" + deg + ")";
      }
    };
    Cube.prototype.sideChange = function () {
      new Howl({
        src: ["/sounds/SwitchCube.mp3"],
        autoplay: true,
        // loop: true,
        volume: 0.4,
      }).play();
      for (var i = 0; i < this.sides.length; ++i) {
        this.sides[i].getElementsByClassName("cube-image")[0].className =
          "cube-image";
      }

      var activeNode =
        this.sides[this.viewport.currentSide - 1].getElementsByClassName(
          "cube-image"
        )[0];

      activeNode.className = "cube-image active";

      var codeInput = window.document.getElementById("cube-code-active");
      if (codeInput) {
        codeInput.innerHTML = activeNode.innerHTML;
      }
    };

    new Cube({
      viewport: viewport,
      element: document.getElementsByClassName("cube")[0],
    });

    initMystery({ viewport });

    setFade("in", "cubeWrapper");

    var firstSpin = true;
    var myFunction = function (e) {
      if (firstSpin) {
        firstSpin = false;
        track("cube-first-spin");
      }
      var activeNumber = document.getElementsByClassName("active")[0].innerHTML;
      var codeInput = window.document.getElementById("cube-code");

      if (codeInput) {
        var totalCode = codeInput.innerHTML + activeNumber;

        if (totalCode.length < CubeBehave.maxSteps) {
          new Howl({
            src: ["/sounds/CodeClickInput.mp3"],
            autoplay: true,
            //loop: true,
            volume: 0.5,
          }).play();
          codeInput.innerHTML = totalCode;
          CubeBehave.records[CubeBehave.round].push(codeInput);
        } else {
          new Howl({
            src: ["/sounds/CubeErrorCode.mp3"],
            autoplay: true,
            // loop: true,
            volume: 0.55,
          }).play();

          CubeBehave.records[CubeBehave.round].push(codeInput);
          CubeBehave.round += 1;
          track("cube-round-" + CubeBehave.round);
          CubeBehave.records[CubeBehave.round] = [];



          codeInput.innerHTML = "";
        }
      }

      // was runCubeBehave(): fixed round-based effects; now random mystery events
      mysteryStep();

      //shuffleActiveCube();

      //openWallpaper();
    };

    window.addEventListener("mouseup", myFunction, false);

    // initStars();

    // video backgtound
    // setTimeout(() => {
    //   resetVideo("cubeFireVideo");
    //   setFade("in", "fireExplosionBack", 5);
    // }, 3000);
  }, []);

  //Fire(); pixi

  // window.onresize = () => {
  //   document.body.innerHTML = '';
  //   window.location.reload();
  // };

  return (
    <div id="overlay">
      <section className="fogwrapper">
        <div id="foglayer_01" className="fog">
          <div className="image01"></div>
          <div className="image02"></div>
        </div>
        <div id="foglayer_02" className="fog">
          <div className="image01"></div>
          <div className="image02"></div>
        </div>
        <div id="foglayer_03" className="fog">
          <div className="image01"></div>
          <div className="image02"></div>
        </div>
      </section>
      <canvas id="starfield"></canvas>
      <div id="wrapper">
        <section id="wallpaper">
          <div className="pattern">
            <div
              id="wallUp"
              className="face face1"
              style={{ marginTop: 0 }}
            ></div>
            <div
              id="wallDown"
              className="face face2"
              style={{ marginTop: 0 }}
            ></div>
          </div>
        </section>

        <div
          id="fireExplosionBack"
          className="video-container-fullscreen fade-opasity"
          style={{ opacity: 0 }}
        >
          <video
            id="cubeFireVideo"
            className="videoTag"
            autoPlay={false}
            loop
            muted
          >
            <source src="/videos/FireCubeBack.mp4" type="video/mp4" />
          </video>
        </div>
        <div id="shakeCube">
          <div id="cubeWrapper" className="viewport" style={{ opacity: 0 }}>
            <div id="cubeMain" className="cube" style={{ margin: "0 auto" }}>
              <div
                className="side cube-side"
                style={{ opacity: 0.9, backgroundColor: "rgba(0, 0, 0, 0.75)" }}
              >
                <div className="cube-image">1</div>
              </div>
              <div
                className="side cube-side"
                style={{ opacity: 0.9, backgroundColor: "rgba(0, 0, 0, 0.75)" }}
              >
                <div className="cube-image">2</div>
              </div>
              <div
                className="side cube-side"
                style={{ opacity: 0.9, backgroundColor: "rgba(0, 0, 0, 0.75)" }}
              >
                <div className="cube-image">3</div>
              </div>
              <div
                className="side cube-side"
                style={{ opacity: 0.9, backgroundColor: "rgba(0, 0, 0, 0.75)" }}
              >
                <div className="cube-image">4</div>
              </div>
              <div
                className="side cube-side"
                style={{ opacity: 0.9, backgroundColor: "rgba(0, 0, 0, 0.75)" }}
              >
                <div className="cube-image">5</div>
              </div>
              <div
                className="side cube-side"
                style={{ opacity: 0.9, backgroundColor: "rgba(0, 0, 0, 0.75)" }}
              >
                <div className="cube-image active">6</div>
              </div>
            </div>
          </div>
        </div>
        <div id="blinking-text">
          <p>
            <a id="cube-code" className="title" href="#"></a>
            <a id="cube-code-active" className="title blink" href="#">
              6
            </a>
          </p>
          {/* <p>
          <a id="subtitle" className="subtitle" href="#">
            SUBTITLE
          </a>
        </p> */}
        </div>
        {/* <div className="fire"></div> */}
      </div>
    </div>
  );
}
