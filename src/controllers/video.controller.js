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
  // CASE: if channelId is given in request, and it belongs to the logged in user, then irrespective of
  // isPublished, we should show all the videos made by the user, which is NOT handled here.

  matchConditions.isPublished = true;

    // 3. build sort options
    // validating sort fields given in request URI.
  const allowedSortFields = ["createdAt", "views", "duration", "title"]
  let sortField = sortBy
  // we are providing services that can be sorted only based on allowedSortFields. our backend
  // handles the case when sortBy is not passed, so by default sorting will be wrt createdAt
  // if frontend adds a feature of sorting which is not supported by the backend, backend will
  // throw below error, indicating frontend that backend can not provide service for this feature.
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
        as: "publishedBy",
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
        publishedBy: {
          $first: "publishedBy"
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
  // NOTE: currently we are not checking the extension of the file uploaded, so, one can publish a
  // video but it would have videoFile as a .txt, which would instead be a text file, and therefore
  // should not have had been uploaded but gets uploaded, now this is a serious problem, as
  // our service provides duration. In cloudinary, .duration for a txt file can yield serious problem.
  // Similarly we should handle the case with the thumbnail.

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
    //TODO: get video by id
  const { videoId } = req.params

  if (!videoId?.trim()) {
    throw new ApiError(400, "Video ID is missing.")
  }

  // 1. Check if the provided string is a valid MongoDB ObjectId
  if (!isValidObjectId(videoId)) {
    throw new ApiError(400, "Invalid video ID format.");
  }

  // 2. Query the database to see if the video exists
  const video = await Video.findById(videoId).populate({
    path: "owner",
    select: "username avatar" // Only select the fields you need
  });

  if (!video) {
    throw new ApiError(404, "Video does not exist.");
  }

  return res
    .status(200)
    .json(new ApiResponse(200, video, "Video fetched successfully."));

})
// TRY: to make use of aggregate instead of populate in getVideoById, for testing which is better.
const updateVideo = asyncHandler(async (req, res) => {
    //TODO: update video details like title, description, thumbnail

  const { videoId } = req.params
  if (!videoId?.trim()) {
    throw new ApiError(400, "Video ID is missing in the URI.")
  }

  if (!isValidObjectId(videoId)) {
      throw new ApiError(400, "Invalid Video ID format.");
  }

  const { title, description } = req.body
  const thumbnailLocalPath = req.file?.path

  if (!title?.trim() && !description?.trim() && !thumbnailLocalPath) {
    throw new ApiError(400, "Atleast one field (title, description, or thumbnail) is required.")
  }

  const video = await Video.findById(videoId)

  if (!video) {
    throw new ApiError(404, "Video ID does not exist.")
  }

  if (video.owner.toString() !== req.user?._id.toString()) {
    throw new ApiError(403, "You do not have permission to update this video.")
    //video can only be updated by the owner of the video.
  }
  if (title?.trim()) {
    video.title = title.trim()
  }
  if (description?.trim()) {
    video.description = description.trim()
  }

  if (thumbnailLocalPath) {
    const oldThumbnail = video.thumbnail
    const newThumbnail = await uploadOnCloudinary(thumbnailLocalPath)

    if (!newThumbnail?.url) {
      throw new ApiError(400, "Error while uploading new thumbnail to cloudinary.")
    }

    video.thumbnail = newThumbnail.url

    //call the old thumbnail delete function
    // NOTE: does not handle the error while deleting the thumbnail from cloudinary.
    if (oldThumbnail) {
      await deleteFromCloudinary(oldThumbnail)
    }
  }

  await video.save()

  return res
      .status(200)
      .json(new ApiResponse(200, video, "Video updated successfully."))

})

const deleteVideo = asyncHandler(async (req, res) => {
    //TODO: delete video
  const { videoId } = req.params
  if (!videoId?.trim()) {
    throw new ApiError(400, "Video ID is missing in the URI.")
  }

  if (!isValidObjectId(videoId)) {
      throw new ApiError(400, "Invalid Video ID format.");
  }

  const video = await Video.findById(videoId)

  if (!video) {
    throw new ApiError(404, "Video ID does not exist.")
  }

  if (video.owner.toString() !== req.user?._id.toString()) {
    throw new ApiError(403, "You do not have permission to delete this video.")
    //video can only be deleted by the owner of the video.
  }
  // TODO: try catch to handle these :
  await deleteFromCloudinary(video.thumbnail)
  await deleteFromCloudinary(video.videoFile, "video")

  await video.deleteOne()

  return res
    .status(200)
    .json(new ApiResponse(200), "Video deleted successfuly.")

})

const togglePublishStatus = asyncHandler(async (req, res) => {
  const { videoId } = req.params

  if (!videoId?.trim()) {
    throw new ApiError(400, "Video ID is missing in the URI.")
  }

  if (!isValidObjectId(videoId)) {
    throw new ApiError(400, "Invalid Video ID format.")
  }

  const video = await Video.findById(videoId)

  if (!video) {
    throw new ApiError(404, "Video does not exist.")
  }

  if (video.owner.toString() !== req.user?._id.toString()) {
    throw new ApiError(403, "You do not have permission to toggle publish status for this video.")
  }

    // Toggle the boolean value
  video.isPublished = !video.isPublished

  await video.save({ validateBeforeSave: false })

  return res
    .status(200)
    .json(
      new ApiResponse(200,
        { isPublished: video.isPublished },
        `Video publish status changed to ${video.isPublished ? "Published" : "Unpublished"} successfully.`
      )
    )
})

export {
    getAllVideos,
    publishAVideo,
    getVideoById,
    updateVideo,
    deleteVideo,
    togglePublishStatus
}
