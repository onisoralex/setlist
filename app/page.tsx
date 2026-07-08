import { redirect } from "next/navigation";

// /songs is the canonical song list URL; this root route just forwards there. A server
// redirect is enough since nothing client-side needs to happen first.
const RootPage = () => {
  redirect("/songs");
};

export default RootPage;
