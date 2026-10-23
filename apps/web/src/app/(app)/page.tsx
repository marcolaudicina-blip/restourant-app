"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { PageLoader } from "@/components/ui/spinner";
import { useConfig } from "@/lib/queries";
import { useRestaurant } from "@/lib/restaurant";

/** Sends a brand-new restaurant to the setup wizard, everyone else to today's bookings. */
export default function Home() {
  const router = useRouter();
  const config = useConfig();
  const restaurant = useRestaurant();

  useEffect(() => {
    if (!config.data) return;
    const empty = config.data.rooms.length === 0 && config.data.services.length === 0;
    router.replace(empty && restaurant.can("config.write") ? "/benvenuto" : "/prenotazioni");
  }, [config.data, restaurant, router]);

  return <PageLoader />;
}
