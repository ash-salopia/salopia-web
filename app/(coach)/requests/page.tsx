import { redirect } from "next/navigation";

// "Request a Feature" moved into the Coach Forum as one room
// (0085_coach_forum.sql). Keep this path working for bookmarks and
// help-doc links.
export default function RequestsRedirect() {
  redirect("/forum?room=feature-requests");
}
