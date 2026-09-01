import type { SxProps, Theme } from "@mui/material/styles";

export const authTextFieldSx: SxProps<Theme> = {
  "& .MuiInputLabel-root": {
    color: "#737373",
    fontFamily: "var(--font-sans)",
    fontSize: "13px",
    letterSpacing: "inherit",
    "&.Mui-focused": { color: "var(--brand-accent)" },
  },
  "& .MuiOutlinedInput-root": {
    minHeight: "44px",
    borderRadius: "8px",
    backgroundColor: "#fff",
    color: "var(--text-primary)",
    fontFamily: "var(--font-sans)",
    fontSize: "13px",
    letterSpacing: "inherit",
    transition: "box-shadow 200ms cubic-bezier(.2,.8,.2,1)",
    "& fieldset": { borderColor: "#dde3e0" },
    "@media (hover: hover) and (pointer: fine)": {
      "&:hover fieldset": { borderColor: "#72a997" },
    },
    "&.Mui-focused": { boxShadow: "0 0 0 3px rgba(21,150,106,.12)" },
    "&.Mui-focused fieldset": { borderColor: "var(--brand-accent)", borderWidth: "1px" },
    "&.Mui-disabled": { backgroundColor: "#f5f5f5", color: "#c5c5c5" },
  },
  "& .MuiInputBase-input": {
    boxSizing: "border-box",
    lineHeight: "20px",
    paddingBottom: "11px",
    paddingTop: "11px",
    "&::placeholder": { color: "#a3a3a3", opacity: 1 },
  },
};
