import { campusEventsOf, type CampusEventsPayload } from "@/campus/campus-events";
import { ApiError, apiJson } from "@/shared/api-base";

export async function fetchCampusEvents(): Promise<CampusEventsPayload> {
  try {
    return campusEventsOf(await apiJson<unknown>("/api/campus-events"));
  } catch (err) {
    //a backend from before campus events has no such route
    if (err instanceof ApiError && err.status === 404) throw new ApiError("This WatAgent server doesn't have UWaterloo events yet. Update the backend, then try again.", 404);
    throw err;
  }
}
