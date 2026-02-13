import { MailerOptionsType, EmailOptionsType } from "@/utils/types/MailTypes";
import { createTransport, Transporter } from "nodemailer";
import { MailTransporterConfig } from "@/utils";
import { renderFile } from "pug";
import { join } from "path";
import juice from "juice";
import fs from "fs";

let transporter: Transporter;

const defaultEmailContext = {
  from: `Notification<${process.env.MAIL_USER}>`,
  replyTo: `${process.env.MAIL_REPLY}`,
  to: "",
  subject: "",
  attachments: [],
};

const sendMail = (options: EmailOptionsType) =>
  new Promise((resolve, reject) => {
    try {
      if (!transporter) {
        init(MailTransporterConfig);
      }
      transporter.sendMail(options, (err, message) => {
        if (err) return reject(err);
        resolve(message);
      });
    } catch (e) {
      return reject(new Error("Mail transporter not created."));
    }
  });

const init = (config: MailerOptionsType) => {
  transporter = createTransport(config);
};

const send = (options: EmailOptionsType, data: object, template: string) =>
  new Promise((resolve, reject) => {
    process.nextTick(() => {
      const file: string = join(
        process.cwd(),
        "src",
        "views",
        "mails",
        template + ".pug",
      );
      renderFile(file, data, (err, html) => {
        if (err) return reject(err);
        let html_rendered = juice(html);
        if (process.env.ENVIROMENT !== "prod") {
          const rand = parseInt(String(Math.random() * 100000000000));
          const filepath = join(process.cwd(), "uploads");
          const filename = `${filepath}/${rand}_mail.html`;
          fs.appendFile(filename, html_rendered || "", (writeErr) => {
            if (writeErr) {
              reject();
            } else {
              resolve(true);
              console.log(`Email HTML written to ${filename}`);
            }
          });
        } else {
          options.html = html_rendered;
          sendMail(options).then(resolve).catch(reject);
        }
      });
    });
  });

const sendEmail = async (
  email: string,
  subject: string,
  data: object,
  view: string,
) => {
  try {
    const sendData: any = { ...defaultEmailContext, to: email, subject };
    // return await send(sendData, data, view);
  } catch (error) {
    console.log("sendEmail ~ error:", error);
    return false;
  }
};

// const sendEmailWithFile = async (email: string, subject: string, data: object, view: string, file: any) => {
//   try {
//     if (process.env.ENVIROMENT !== 'prod') return false
//     const sendData: any = { ...defaultEmailContext, to: email, subject, attachments: [file] }
//     return await send(sendData, data, view)
//   } catch (error) {
//     return false
//   }
// }

export { init, sendEmail };
