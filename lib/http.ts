import { NextResponse } from "next/server";
import { ShipSavingError } from "./shipsaving";

export function errorResponse(err: unknown) {
  if (err instanceof ShipSavingError) {
    console.error("[ShipSaving]", err.message, err.details ?? "");
    return NextResponse.json({ error: err.message }, { status: err.status });
  }
  console.error(err);
  return NextResponse.json({ error: "Something went wrong on the server. Check the logs." }, { status: 500 });
}
