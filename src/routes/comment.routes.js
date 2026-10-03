import { Router } from "express"
import {
  addComment,
  deleteComment,
  getVideoComments,
  updateComment
} from "../controllers/comment.controller.js"
import { verifyJWT } from "../middlewares/auth.middleware.js"

const router = Router()

router.use(verifyJWT) // because before doing any function of comments, user must login.
// can update it later to let users getVideoComments without login.

router.route("/:videoId").get(getVideoComments).post(addComment)
router.route("/c/:commentId").delete(deleteComment).patch(updateComment)

export default router
