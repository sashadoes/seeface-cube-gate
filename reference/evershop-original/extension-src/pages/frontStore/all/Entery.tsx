import React, { useEffect, useState } from "react";

import { getYearsDay } from "../../../components/helper.js";

import dailyPasses from "../../../../config/dailyPass.json" with { type: "json" }; //passes code to reach the website (cron changed daily)
import magicPasses from "../../../../config/magicPass.json" with { type: "json" }; //magic code to reach the website for returning users

import WelcomeForm from "../../../components/welcomeForm/WelcomeForm.js";
import Cube from "../../../components/cube/Cube.js";

//check code pass
let day = getYearsDay();
const enteryCode = dailyPasses[day];

//check url
const url = new URL(window.location.href);
const activationCode = url.searchParams.get("activator");

// super customer
const special = url.searchParams.get("special");
if (special && magicPasses.includes(special)) {
  localStorage.setItem("access-code-contraface", enteryCode);
}

export default function Overlay() {
  const accessToken = localStorage.getItem("access-code-contraface");

  const [screen, setScreen] = useState("form");

  const openCube = () => {
    setScreen("cube");
  };

  useEffect(() => {
    if (activationCode) {
      // search for an active purchase
      fetch("http://localhost:3001/api/v1/activator/check", {
        method: "POST",
        mode: "cors",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          activationCode: activationCode,
        }),
      }).then((response) => {
          return response.json(); // This starts consuming the stream
        })
        .then((data) => {
         console.log(data);
        })
        .then((response) => console.log(response))
        .catch((error) => console.error(error));
    }
  }, []);

  // if (accessToken != enteryCode && screen == "form") {
  //   return <WelcomeForm openCube={openCube} />;
  // }

  // if (accessToken != enteryCode && screen == "cube") {
  //   return <Cube />
  // }

  // return <></> ;



  return   <Cube /> ;
}

export const layout = {
  areaId: "body",
  sortOrder: 0,
};
