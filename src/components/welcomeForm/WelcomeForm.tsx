import React, { useEffect, useState } from "react";
import { validateEmail } from "../helper.js";
import { track } from "../../analytics";
import "./WelcomeForm.scss";

function EmailForm() {
  const [email, setEmail] = useState("");
  const [form, setForm] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [dots, setDots] = useState(".");

  useEffect(() => {
    if (loading) {
      const intervalId = setInterval(() => {
        if (dots === ".") {
          setDots("..");
          return;
        }
        if (dots === "..") {
          setDots("...");
          return;
        }
        if (dots === "...") {
          setDots("");
          return;
        }
        if (dots === "") {
          setDots(".");
          return;
        }
      }, 400);

      fetch("/api/check/email", {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          email: email,
        }),
      })
        .then((response) => {
          return response.json(); // This starts consuming the stream
        })
        .then((data) => {
          if (data.success) {
            setForm("sent");
          } else {
            setForm("notFound");
          }
        })
        .then(() => {
          setTimeout(() => setLoading(false), 3000);
        })
        .catch((error) => setError(error));

      return () => clearInterval(intervalId);
    }
  }, [loading, dots]);

  const typeEmail = (e) => {
    setEmail(e.target.value);
  };

  const actionCB = (e) => {
    e.preventDefault();
    const isValid = validateEmail(email);
    if (isValid) {
      setLoading(true);
    } else {
      setLoading(false);
      setEmail("");
    }
  };

  if (loading) {
    return (
      <>
        <p className="top-space">Looking your account, give us a sec{dots}</p>
      </>
    );
  }

  if (form === "sent") {
    return (
      <>
        <p className="top-space">Your magic link was sent to your email.</p>
      </>
    );
  }

  if (form === "notFound") {
    return (
      <>
        <p className="top-space">
          Email that you have provided is not registred in our database. Pleaase
          try again with another email.
        </p>
      </>
    );
  }

  if (error !== "") {
    return (
      <>
        <p className="top-space">
          Error occured:{error}. We are on the way to fix it.
        </p>
        <p>Please try again later.</p>
      </>
    );
  }

  return (
    <form action={actionCB} id="signup-form">
      <p>
        Please provide the email address used for your account or recent
        purchases.
      </p>
      <br />
      <label htmlFor="email">Email:&nbsp;</label>
      <input
        type="email"
        onChange={typeEmail}
        name="email"
        id="email"
        placeholder="Your email"
        value={email}
      />
      <button onClick={actionCB}>&nbsp;Send link</button>
    </form>
  );
}

function WelcomeMesasage(props) {
  const { actionCB } = props;

  const handleCLickEmail = (e) => {
    e.preventDefault();
    track("magic-link-clicked");
    actionCB("email");
  };

  const handleCLickCube = (e) => {
    e.preventDefault();
    actionCB("cube");
  };

  return (
    <div className="welcome-form">
      <p>
        We’ve noticed a lot of unwanted attention lately. To keep our community
        secure and our doors open for those who truly belong here, we’ve added
        an extra layer of digital armor.
      </p>
      <p className="loyalty">We value your privacy and loyalty!</p>
      <br />
      <h3>Returning Members:</h3>
      <p>
        If you are registred member please&nbsp;
        <a href="/" className="welcome-click" onClick={handleCLickEmail}>
          click here
        </a>
        &nbsp;and we will send a "Magic Link" to bypass the gate instantly.
      </p>
      <h4>New Arrivals:</h4>
      <p>
        If you’ve been granted a Welcome PIN, please&nbsp;
        <a href="/" className="welcome-click" onClick={handleCLickCube}>
          enter it now
        </a>
        &nbsp;to prove you aren't just a tourist.
      </p>
      <p>Good luck.</p>
    </div>
  );
}

export default function WelcomeForm(props) {
  const { openCube } = props; // close window
  const [screen, setScreen] = useState("welcome");

  useEffect(() => {
    if (screen == "cube") {
      openCube();
    }
  });

  return (
    <div id="overlay">
      <div className="welcome-form-container fade-in">
        {screen === "welcome" && <h1>Are you on the list?</h1>}
        {screen === "email" && (
          <h1
            onClick={() => {
              setScreen("welcome");
            }}
          >
            ← go back
          </h1>
        )}
        {screen === "welcome" && <WelcomeMesasage actionCB={setScreen} />}
        {screen === "email" && <EmailForm />}
      </div>
    </div>
  );
}
