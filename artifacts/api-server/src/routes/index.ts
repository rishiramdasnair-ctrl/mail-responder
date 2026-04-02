import { Router, type IRouter } from "express";
import healthRouter from "./health";
import authRouter from "./auth";
import gmailRouter from "./gmail";
import aiRouter from "./ai";
import historyRouter from "./history";
import billingRouter from "./billing";
import settingsRouter from "./settings";

const router: IRouter = Router();

router.use(healthRouter);
router.use(authRouter);
router.use(gmailRouter);
router.use(aiRouter);
router.use(historyRouter);
router.use(billingRouter);
router.use(settingsRouter);

export default router;
