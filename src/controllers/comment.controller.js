import mongoose from "mongoose"
import {Comment} from "../models/comment.model.js"
import {ApiError} from "../utils/ApiError.js"
import {ApiResponse} from "../utils/ApiResponse.js"
import {asyncHandler} from "../utils/asyncHandler.js"
import {Video} from "../models/video.model.js"

// NOTE: for now, the videoSchema does not have a field to hold number of comments, or reply
// to comments, so we are not handling replyToComment, which would require commentId.
// in the cases of addComment being succesful, we are not handling the part of incrementing the
// count of comment present in videoSchema. Similarly, to maintain the counting of replies for a comment,
// if and when the replyToComment would be added, we would have to add a field in commentSchema
// -> reply: Number, default: 0 (most likely)
// which should be incremented when replyToComment is succesful.

const getVideoComments = asyncHandler(async (req, res) => {
    //TODO: get all comments for a video
    // 1. verify sign in -> verifyJWT (done in routes)
    // 2. get user data from frontend. what data should user give in postman?
                                    // my guess : accessToken, some id of video / unique name of the video.
    // 3. validation -> check if any input field is empty
  const { videoId } = req.params    // the route uri contains videoId whose comments we want.
  const { page = 1, limit = 10 } = req.query // by default it tells to give first 10 lines.
                                  // page = 2, limit = 10 means skip first 10 lines and give next 10.

  if (!videoId?.trim()) {
    throw new ApiError(400, "Video ID is missing.")
  }
  const pageNumber = parseInt(page, 10) //dont confuse 10 with default value, it is the base of the number sys.
  const limitNumber = parseInt(limit, 10) // same, 10 is the base of the number system.
  const skip = (pageNumber - 1) * limitNumber
  // console.log("THE VALUE OF SKIP IS:")
  // console.log(skip)
  // console.log("THE VALUE OF VIDEO ID IS:")
  // console.log(videoId)
      // TODO: sorting criteria is not asked by user, and it is hard coded based on createdAt, so implement
      // sorting criteria.
  const comments = await Comment.aggregate([
    {
      $match  : {
        //_id: videoId -> wrong approach, because _id is the id of this comment document.
        // comparing it with videoId is obsolete.
        video: new mongoose.Types.ObjectId(videoId)
      }
    },
    {
      $sort: {
        createdAt: -1 // Show newest comments first
      }
    },
    {
      $lookup: {
        // we now got all the comments of the given videoId.
        // we should also show the username and avatar of the owner who wrote comment.
        // we need to join the commentSchema with userSchema on field owner/username
        from: "users",
        localField: "owner",
        foreignField: "_id",
        as: "commentedBy",
        pipeline: [
          {
            $project: {
              username: 1,
              avatar: 1
            }
          }
        ]
      }
    },
    {
      $addFields: {
        commentedBy: {
          $first: "$commentedBy"
        }
      }
    },
    {
      $skip: skip
    },
    {
      $limit: limitNumber
    }
  ])

  //fixed : if video id does not exist, throw error.
  if (!comments?.length) {
    throw new ApiError(404, "Video does not exist.")
  }

  return res
    .status(200)
    .json(
      new ApiResponse(200, comments, "Comments fetched succesfully.")
    )
})

const addComment = asyncHandler(async (req, res) => {
    // TODO: add a comment to a video
  const { videoId } = req.params

  if (!videoId?.trim()) {
    throw new ApiError(400, "Video id is missing.")
  }
  const { content } = req.body

  if (!content?.trim()) {
    throw new ApiError(400, "Content is required.")
  }
  const video = await Video.findById(videoId)
  if (!video) {
    throw new ApiError(404, "Video does not exist.")
  }

  const comment = await Comment.create({
    content, // shorthand for content: content
    video: videoId,
    owner: req.user?._id
  })

  return res
    .status(201)
    .json(new ApiResponse(201, comment, "Comment added successfuly."))
})

const updateComment = asyncHandler(async (req, res) => {
    // TODO: update a comment
  const { commentId } = req.params

  if (!commentId?.trim()) {
    throw new ApiError(400, "Comment ID is missing in URI.")
  }

  const { content } = req.body

  if (!content?.trim()) {
   throw new ApiError(400, "The new content is required.")
  }

  const comment = await Comment.findById(commentId)

  if (!comment) {
    throw new ApiError(404, "Comment ID does not exist.")
  }

  if (comment.owner.toString() !== req.user?._id.toString()) {
    throw new ApiError(403, "Access to update the comment is forbidden.")
    //comment can only be updated by the owner of the comment.
  }

  comment.content = content
  await comment.save({ validateBeforeSave: false })

  return res
    .status(200)
    .json( new ApiResponse(200, comment, "Comment updated successfuly."))
})

const deleteComment = asyncHandler(async (req, res) => {
    // TODO: delete a comment
  const { commentId } = req.params

  if (!commentId?.trim()) {
    throw new ApiError(400, "Comment ID is missing in URI.")
  }

  if (!isValidObjectId(commentId)) {
      throw new ApiError(400, "Invalid Comment ID format.");
  }

  const comment = await Comment.findById(commentId)

  if (!comment) {
    throw new ApiError(404, "Comment ID does not exist.")
  }

  if (comment.owner.toString() !== req.user?._id.toString()) {
    throw new ApiError(403, "Access to delete the comment is forbidden.")
    //comment can only be deleted by the owner of the comment.
  }

  await comment.deleteOne()

  return res
    .status(200)
    .json(new ApiResponse(200), "Comment deleted successfuly.")

})

export {
    getVideoComments,
    addComment,
    updateComment,
    deleteComment
}
