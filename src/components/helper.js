export function getYearsDay() {
  //check code pass
  let now = new Date();
  let start = new Date(now.getFullYear(), 0, 0);
  let diff = now - start;
  let oneDay = 1000 * 60 * 60 * 24;
  return Math.floor(diff / oneDay);
}

export function validateEmail(email) {
  return String(email)
    .toLowerCase()
    .match(
      /^(([^<>()[\]\\.,;:\s@"]+(\.[^<>()[\]\\.,;:\s@"]+)*)|.(".+"))@((\[[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\])|(([a-zA-Z\-0-9]+\.)+[a-zA-Z]{2,}))$/
    );
}

export function randomIntFromInterval(min, max) {
  // min and max included
  return Math.floor(Math.random() * (max - min + 1) + min);
}

export function appendVideo(id, src, whereId, place, duration) {
  const video = document.createElement("video");
  video.id = id;
  video.src = src;

  video.className = "videoTag fade-in";

  video.autoPlay = true;
  video.loop = true;
  video.muted = true;

  if (place == "prepend") {
    document.getElementById(whereId).prepend(video);
  } else {
    document.getElementById(whereId).append(video);
  }

  //setTimeout((document.getElementById(whereId).outerHTML = ""), duration);
}

export function fadeIn(el, time) {
  var fade = document.getElementById(el);
  var opacity = 0;
  var intervalID = setInterval(function () {
    if (opacity < 1) {
      opacity = opacity + 0.1;
      fade.style.opacity = opacity;
    } else {
      clearInterval(intervalID);
    }
  }, time);
}

export function fadeOut(el, time) {
  var fade = document.getElementById(el);
  var opacity = 0;
  var intervalID = setInterval(function () {
    if (opacity > 0) {
      opacity = opacity - 0.1;
      fade.style.opacity = opacity;
    } else {
      clearInterval(intervalID);
    }
  }, time);
}

export function setFade(what, elId, time) {
  if (what == "in") fadeIn(elId, time || 200);
  if (what == "out") fadeIn(out, time || 200);
}

export function resetVideo(elId) {
  var video = document.getElementById(elId);
  video.pause();
  video.currentTime = 0;
  video.play();
}


