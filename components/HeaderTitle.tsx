"use client";

import Link from "next/link";
import { useHeaderTitle } from "@/components/HeaderTitleProvider";
import styles from "@/app/layout.module.css";

// Nav's left-side title slot -- renders whatever the active page supplied via
// useSetHeaderTitle, falling back to the static brand name for pages that don't wire in yet
// (login, event detail/edit).
const HeaderTitle = () => {
  const title = useHeaderTitle();
  return (
    <Link href="/" className={styles.brand}>
      {title ?? "setlist"}
    </Link>
  );
};

export default HeaderTitle;
