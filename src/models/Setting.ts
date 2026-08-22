import { Schema, model } from "mongoose";

const SettingSchema = new Schema(
  {
    companyName: {
      type: String,
      default: "Capricorn Energy",
      trim: true,
    },
    domainName: {
      type: String,
      default: "capricorn.com",
      trim: true,
    },
    email: {
      type: String,
      default: "support@capricorn.com",
      trim: true,
    },
    phone: {
      type: String,
      default: "",
      trim: true,
    },
    address: {
      type: String,
      default: "",
      trim: true,
    },
    description: {
      type: String,
      default: "",
      trim: true,
    },
    showCurrency: {
      type: Boolean,
      default: false,
    },
    registrationLink: {
      type: String,
      default: "",
      trim: true,
    },
    mapEmbed: {
      type: String,
      default: "",
    },
    documents: {
      type: [
        {
          name: { type: String, default: "" },
          url: { type: String, default: "" },
        },
      ],
      default: [],
    },
  },
  {
    timestamps: true,
  }
);

export const Setting = model("Setting", SettingSchema);
export default Setting;
