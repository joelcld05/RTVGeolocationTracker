import { modelName as _UserModelName } from "@/models/_User";
import { InferSchemaType, model, Schema } from "mongoose";
import type { ObjectIdExtendType } from "@/types";

export const schema = new Schema(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: _UserModelName,
      index: true,
    },
    access: { type: [String], index: true, default: [] },
    typeFormUser: { type: Number },
    partner_asignado: { type: String },
    name: { type: String },
    lastName: { type: String },

    identification: { type: String },
    identification_type: { type: String },
    expiration: { type: Date },

    birthdate: { type: Date },
    prefix: { type: String },
    phone: { type: String },
    nationality: { type: String },
    country: { type: String },
    city: { type: String },
    address: { type: String },
    zip: { type: String },
    uscitizen: { type: Boolean },
    pep: { type: Boolean },
    // invested: { type: String },
    stoKnown: { type: String },

    lose: { type: String },
    origin: { type: String },
    invesmentTime: { type: String },
    objetivePursue: { type: String },
    professionalInvestor: { type: Boolean },
    // studies: { type: String },
    // profession: { type: String },
    // fluctuation: { type: String },
    // percentInvest: { type: String },
    // periodicincome: { type: String },
    // income: { type: String },
    sameasholder: { type: Boolean },

    jurisdictionform: { type: String },
    cif: { type: String },
    jurisdiction: { type: String },
    companycity: { type: String },
    companyaddress: { type: String },
    companyzip: { type: String },
    comments: { type: String },
    message: { type: String },
    valiDatedBy: { type: String },
    DateValiDated: { type: Date },
    currency: { type: String },
    lastquestion: { type: Number, default: 1 },
    errorquestion: { type: Array<string>, index: true, default: [] },
    script: { type: String, isFile: true },
    certificate: { type: String, isFile: true },
    power: { type: String, isFile: true },
    dnifront: { type: String, isFile: true },
    dniback: { type: String, isFile: true },
    selfie: { type: String, isFile: true },
    residenceproof: { type: String, isFile: true },
    otherfile: { type: String, isFile: true },

    // anverso: { type: String, isFile: true },
    // reverso: { type: String, isFile: true },
  },
  {
    timestamps: { createdAt: "created_at", updatedAt: "updated_at" },
  },
);

type _KycType = InferSchemaType<typeof schema> & ObjectIdExtendType;

const modelName = "us_kyc";
export default model(modelName, schema, modelName);
export type { _KycType };
export { modelName };
