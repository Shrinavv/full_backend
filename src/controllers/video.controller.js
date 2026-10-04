import mongoose, {isValidObjectId} from "mongoose"
import {Video} from "../models/video.model.js"
import {User} from "../models/user.model.js"
import {ApiError} from "../utils/ApiError.js"
import {ApiResponse} from "../utils/ApiResponse.js"
import {asyncHandler} from "../utils/asyncHandler.js"
import {uploadOnCloudinary} from "../utils/cloudinary.js"


const getAllVideos = asyncHandler(async (req, res) => {
    // added default values of sortBy and sortType to prevent throwing un neccessary error.
  const { page = 1, limit = 10, query, sortBy = "createdAt", sortType = "desc", userId } = req.query
    //TODO: get all videos based on query, sort, pagination

    //1. pagination math.
  const pageNumber = parseInt(page, 10)
  const limitNumber = parseInt(limit, 10)
  const skip = (pageNumber - 1) * limitNumber

    //2. build pipeline match conditions dynamically.
  const matchConditions = {};

    // if a search query exists, search title and description
  if (query?.trim()) {
    matchConditions.$or = [
      { title: { $regex: query, $options: "i" } },
      { description: { $regex: query, $options: "i" } }
    ];
  }

    // if a user id is passed, filter by that owner.
  if (userId) {
    if (!mongoose.Types.ObjectId.isValid(userId)) {
      throw new ApiError(400, "Invalid user ID format.")
    }
    matchConditions.owner = new mongoose.Types.ObjectId(userId)
  }

    // Optional: Only fetch published videos
  matchConditions.isPublished = true;

    // 3. build sort options
    // validating sort fields given in request URI.
  const allowedSortFields = ["createdAt", "views", "duration", "title"]
  let sortField = sortBy
  if (!allowedSortFields.includes(sortBy)) {
    // Option A: Throw an error
    throw new ApiError(400, `Invalid sort field. Allowed fields are: ${allowedSortFields.join(", ")}`)

    // Option B: Or gracefully fall back to a default instead of throwing
    // sortField = "createdAt";
  }

    // validating sort type given in request URI. Not neccessary but makes API response more predictable.
  const allowedSortTypes = ["asc", "desc"]
  if (sortType && !allowedSortTypes.includes(sortType)) {
    throw new ApiError(400, "Invalid sort type. Allowed values are: 'asc' or 'desc'.")
  }

  const sortCriteria = {}
  sortCriteria[sortBy] = sortType === "asc" ? 1 : -1

    //4. execute aggregation pipeline
  const videos = await Video.aggregate([
    {
      $match: matchConditions
    },
    {
      $sort: sortCriteria
    },
    {
      $skip: skip
    },
    {
      $limit: limitNumber
    },
    {
      $lookup: {
        from: "users",
        localField: "owner",
        foreignField: "_id",
        as: "ownerDetails",
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
        ownerDetails: {
          $first: "$ownerDetails"
        }
      }
    }
  ])

  return res
    .status(200)
    .json(new ApiResponse(200, videos, "Videos fetched successfully."))
})

const publishAVideo = asyncHandler(async (req, res) => {
    // TODO: get video, upload to cloudinary, create video
  // assuming all videos are published for now (isPublished is true).
  const { title, description } = req.body
  if (!title?.trim() || !description?.trim()) {
    throw new ApiError(400, "Title and description is required.")
  }

  const videoLocalPath = req.files?.videoFile?.[0]?.path
  const thumbnailLocalPath = req.files?.thumbnail?.[0]?.path
  if(!videoLocalPath || !thumbnailLocalPath){
      throw new ApiError(400, "Both video and thumbnail is required.")
  }

  const videoFile = await uploadOnCloudinary(videoLocalPath)
  const thumbnailFile = await uploadOnCloudinary(thumbnailLocalPath)
  if (!videoFile) {
    throw new ApiError(400, "Unable to upload the video to cloudinary.")
  }
  if (!thumbnailFile) {
    throw new ApiError(400, "Unable to upload the thumbnail to cloudinary.")
  }

  const video = await Video.create({
      videoFile: videoFile.url,
      thumbnail: thumbnailFile.url,
      title,
      description,
      duration: videoFile.duration,
      owner: req.user._id
  })

  if (!video) {
    throw new ApiError(500, "Something went wrong while publishing.")
  }

  return res
    .status(201)
    .json(new ApiResponse(201, video, "Video published successfully."))
})

const getVideoById = asyncHandler(async (req, res) => {
    const { videoId } = req.params
    //TODO: get video by id
})

const updateVideo = asyncHandler(async (req, res) => {
    const { videoId } = req.params
    //TODO: update video details like title, description, thumbnail

})

const deleteVideo = asyncHandler(async (req, res) => {
    const { videoId } = req.params
    //TODO: delete video
})

const togglePublishStatus = asyncHandler(async (req, res) => {
    const { videoId } = req.params
})

export {
    getAllVideos,
    publishAVideo,
    getVideoById,
    updateVideo,
    deleteVideo,
    togglePublishStatus
}
