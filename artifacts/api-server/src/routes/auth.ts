import { Router } from "express";
import { getAuth } from "@clerk/express";
import { requireAuth } from "../lib/requireAuth";
import { getOrCreateUser, getUserPlan, getRepliesLimit } from "../lib/getOrCreateUser";

const router = Router();

router.get("/auth/me", requireAuth, async (req, res) => {
  try {
    const auth = getAuth(req);
    const userId = auth.userId!;
    const email = auth.sessionClaims?.email as string | undefined;

    const user = await getOrCreateUser(userId, email);
    const plan = getUserPlan(user);
    const repliesLimit = getRepliesLimit(user);

    res.json({
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      imageUrl: user.imageUrl,
      plan,
      trialEndsAt: user.trialEndsAt?.toISOString(),
      repliesUsed: user.repliesUsed,
      repliesLimit,
    });
  } catch (err) {
    req.log.error({ err }, "Error getting user profile");
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
