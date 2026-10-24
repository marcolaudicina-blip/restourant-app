import type { MetadataRoute } from "next";
import { PRODUCT_NAME } from "@/components/product-logo";

/** Lets staff add the app to a tablet's or phone's home screen. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: PRODUCT_NAME,
    short_name: PRODUCT_NAME,
    description: "Prenotazioni e sala per ristoranti",
    lang: "it",
    start_url: "/",
    display: "standalone",
    background_color: "#f6f5f2",
    theme_color: "#2f6555",
    icons: [
      { src: "/brand/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/brand/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
  };
}
