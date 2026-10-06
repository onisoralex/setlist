"use client";

import Button from "@mui/material/Button";
import SvgIcon from "@mui/material/SvgIcon";

type EditIconButtonProps = {
  onClick: () => void;
};

// Pencil "edit song" button shared by the song list rows, the song detail page, and the
// tracklist editor's song rows. The Material "Edit" path is inlined via SvgIcon rather than
// pulled from @mui/icons-material -- one icon doesn't justify a new dependency. Styled like the
// surrounding small secondary buttons (Override/↑/↓/Rename) so it sits in the same row visually;
// minWidth: 0 drops Button's 64px text-button minimum, which would leave a lone icon floating in
// a wide pill. No visible text, hence the aria-label plus a matching title tooltip.
const EditIconButton = ({ onClick }: EditIconButtonProps) => (
  <Button
    type="button"
    variant="contained"
    color="secondary"
    size="small"
    onClick={onClick}
    aria-label="Edit song"
    title="Edit song"
    sx={{ minWidth: 0, paddingInline: "var(--space-sm)" }}
  >
    <SvgIcon fontSize="small">
      <path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34a.9959.9959 0 0 0-1.41 0l-1.83 1.83 3.75 3.75z" />
    </SvgIcon>
  </Button>
);

export default EditIconButton;
