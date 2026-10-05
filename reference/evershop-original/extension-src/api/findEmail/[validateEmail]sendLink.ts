import { pool } from "@evershop/evershop/lib/postgres";
import { select } from "@evershop/postgres-query-builder";
import path from "path";
import { promises } from "fs";
import Handlebars from "handlebars";
import { CreateEmailOptions, Resend } from "resend";
import { getEnv } from "@evershop/evershop/lib/util/getEnv";
import { getConfig } from "@evershop/evershop/lib/util/getConfig";
import { getValue } from "@evershop/evershop/lib/util/registry";
import { error } from "@evershop/evershop/lib/log";
import { CONSTANTS } from "@evershop/evershop/lib/helpers";
import magicPasses from "../../../config/magicPass.json" with { type: "json" };

export default async function graphql(request, response, next) {
  try {
    const {
      body: { email },
    } = request;
    // Insert the comment into the database
    const customer = await select("*")
      .from("customer")
      .where("email", "=", email)
      .execute(pool);

    if (customer[0] && customer[0]?.customer_id) {
      await sendOrderConfirmationEmail(customer[0]);

      response.json({ success: true});
    } else {
      response.json({ success: false});
    }
  } catch (error) {
    next(error);
  }
}

function getRandomArbitrary(min, max) {
  return Math.round(Math.random() * (max - min) + min);
}

async function sendOrderConfirmationEmail(data) {
  try {
    // Check if the API key is set
    const apiKey = getEnv("RESEND_API_KEY", "");
    const from = getConfig("resend.from", "");
    if (!apiKey || !from) {
      return;
    }
    const resend = new Resend(apiKey);
    const sentMagicLink = getConfig("system.resend.events.magic_link_sent", {
      enabled: true,
      subject: "Magic Link",
      templatePath: undefined,
    });

    // Check if the we need to send the email on order placed event
    if (sentMagicLink.enabled !== true) {
      return;
    }

    // Preparing the data for email
    const msg: CreateEmailOptions = {
      to: data.email,
      subject: data.subject || "Magic link",
      from,
      html: "",
      text: "",
    };

    const emailDataFinal = await getValue(
      "resend_magic_link_email_data",
      data,
      {}
    );

    const codesAllLenght = magicPasses.length - 1;
    const randomeCode = getRandomArbitrary(0, codesAllLenght);
    const magicLinkCode = magicPasses[randomeCode];

    msg.text =
      `Your magic link is http://localhost:3000/?special=` + magicLinkCode;
    // Read the template if it's set
    // if (sentMagicLink.templatePath) {
    //   // Consider orderPlaced.templatePath is a path to the template file, starting from the root of the project.
    //   // So we need to get the full path to the file
    //   const filePath = path.join(
    //     CONSTANTS.ROOTPATH,
    //     sentMagicLink.templatePath
    //   );
    //   const templateContent = await promises.readFile(filePath, "utf8");
    //   msg.html = Handlebars.compile(templateContent)(emailDataFinal);
    // } else {
    //   msg.text = `Your magic link is http://localhost:3000/special=`+ JSON.stringify(sentMagicLink);
    // }
    await resend.emails.send(msg);
  } catch (e) {
    error(e);
  }
}
