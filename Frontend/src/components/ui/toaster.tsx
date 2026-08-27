import { ToastContainer } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";

export const TOAST_DURATION_MS = 4_000;

export function Toaster() {
  return (
    <ToastContainer
      className="interakt-toast-container"
      position="top-right"
      autoClose={TOAST_DURATION_MS}
      hideProgressBar={false}
      newestOnTop
      closeOnClick
      pauseOnFocusLoss
      pauseOnHover
      draggable
      limit={4}
      theme="light"
    />
  );
}
