import { Router, type IRouter } from "express";
import healthRouter from "./health";
import authRouter from "./auth";
import gmailRouter from "./gmail";
import calendarRouter from "./calendar";
import aiRouter from "./ai";
import agentRouter from "./agent";
import historyRouter from "./history";
import billingRouter from "./billing";
import settingsRouter from "./settings";
import googleAuthRouter from "./googleAuth";
import connectorsRouter from "./connectors";
import hubspotAuthRouter from "./hubspotAuth";
import googleExtendRouter from "./googleExtend";
import hubspotRouter from "./hubspot";
import driveRouter from "./drive";

const router: IRouter = Router();

router.use(healthRouter);
router.use(authRouter);
router.use(googleAuthRouter);
router.use(googleExtendRouter);
router.use(hubspotAuthRouter);
router.use(gmailRouter);
router.use(calendarRouter);
router.use(aiRouter);
router.use(agentRouter);
router.use(historyRouter);
router.use(billingRouter);
router.use(settingsRouter);
router.use(connectorsRouter);
router.use(hubspotRouter);
router.use(driveRouter);

export default router;
