import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/ApiError.js";
import {User} from "../models/user.model.js"
import {uploadOnCloudinary, deleteFromCloudinary } from "../utils/cloudinary.js"
import { ApiResponse } from "../utils/ApiResponse.js";
import jwt from "jsonwebtoken"
// since many times we need to generate access token and refresh token together, so we create a method for it
const generateAccessAndRefreshTokens = async (userId) => {
  try {
    const user = await User.findById(userId)
    const accessToken = user.generateAccessToken()
    const refreshToken = user.generateRefreshToken()
    user.refreshToken = refreshToken
    await user.save({ validateBeforeSave: false })
    return {accessToken, refreshToken}
  } catch (error) {
    console.log("Token Generation error : ", error)
    throw new ApiError(500, "Something went wrong while generating refresh and access token.")
  }
}

const registerUser =  asyncHandler( async (req, res) => {
    //how to register the user?
    //1. get user data from frontend, using postman giving post/get requests to get user details based
    // the model of user, ie, the user model will tell us what to ask for : username, pass, avatar,...
    //2. Validation : empty string? like email missing, etc..
    //3. Check if user already exists. using email, username.
    //4. check for images, check for avatar. check if all the files are there.
    //5. if they are avaiable, upload to cloudinary and check if avatar is uploaded.
    //6. create user object - create entry in db
    //7. remove password and refresh token field from response
    //8. check for user creation (check if there is null response or actually user is created?)
    //9. return res (if response has not come return error.)


    //1 data coming from form/json can be collected using req.body, if it comes from url, will see later
    const {fullname, email, username, password} = req.body
    // console.log("email: ", email)

    if(
        [fullname, email, username, password].some((field) => field?.trim() === "")
    ) {
        throw new ApiError(400, "All fields are required")
    }

    //3
    const existedUser = await User.findOne({
        $or: [{ username }, { email }]
    })

    if(existedUser){
        throw new ApiError(409, "User with email or username already exists")
    }

    //printing other important things for study purpose.
    //console.log(req.body); // to understand in which format it comes and how.
    //console.log(req.files); // to understand how the entire object of request.files comes, what all things
    //                        // it gives, etc. things should be understood by printing them.

    //4.
    const avatarLocalPath = req.files?.avatar[0]?.path
    // const coverImageLocalPath = req.files?.coverImage[0]?.path // this line was commented for below reason
    // if avatar is not there, we are checking immediately, but we are not checking same for coverImage.
    // if we dont post coverImage, then JS will throw
    // TypeError: Cannot read properties of undefined (reading '0').
    // A classic solution to resolve it :
    let coverImageLocalPath
    if (req.files && Array.isArray(req.files.coverImage) && req.files.coverImage.length > 0) {
       coverImageLocalPath = req.files.coverImage[0].path;
      //now if cover image file is not added, it will not throw error, and instead take is as empty string
      // in the response : "coverImage"
    }
    if(!avatarLocalPath){
        throw new ApiError(400, "Avatar is required")
    }

    //5.
    const avatar = await uploadOnCloudinary(avatarLocalPath)
    const coverImage = await uploadOnCloudinary(coverImageLocalPath)

    //6.
    if(!avatar){
        throw new ApiError(400, "Avatar file is required")
    }

    //7.
    const user = await User.create({
        fullname,
        avatar: avatar.url,
        coverImage: coverImage?.url || "",
        email,
        password,
        username: username.toLowerCase()
    })

    //8.
    const createdUser = await User.findById(user._id).select(
        "-password -refreshToken"
    )
    if(!createdUser){
        throw new ApiError(500, "Something went wrong while registering the user")
    }

    // for understanding purpose we should view the response of the cloudinary, not just the url.
    //console.log(avatar); console.log(coverImage); // entire cloudinary response object.
    //console.log(avatar.public_id); // unique identifier assigned by cloudinary, required whenever you
    //                                 // need to delete the data or manage the asset via API.
    //console.log(avatar.secure_url); // to print https url of uploaded asset.
    //console.log(avatar.format); //Prints the file format (e.g., jpg, png),
    //                              // useful for verifying the file type received.
    //console.log(avatar.bytes); // Prints the file size in bytes,
    //                             //helpful for monitoring storage limits and upload bandwidth.
    return res.status(201).json(
        new ApiResponse(200, createdUser, "User registered successfuly")
    )

})

const loginUser = asyncHandler(async (req, res) => {
  // 1. bring data from req body
  // 2. check if username/email is there (design can be in such a way that
  //    we need both username and email or either of them is ok.)
  // 3. find if user is there or not
  // 4. check if password matches or not
  // 5. generate access and generate tokens.
  // 6. send the generated tokens via cookies to user.

  const { email, username, password } = req.body
  if (!username && !email) {
    throw new ApiError(400, "username or email is required")
  }
  const user = await User.findOne({ //User is used for accessing mongodb functions like findOne.
    $or: [{ username }, { email }]
  })
  if (!user) {
    throw new ApiError(404, "user does not exist")
  }
  const isPasswordValid = await user.isPasswordCorrect(password)
  if (!isPasswordValid) {
    throw new ApiError(401, "Invalid user credentials")
  }
  //5.
  const { accessToken, refreshToken } = await generateAccessAndRefreshTokens(user._id)

  const loggedInUser = await User.findById(user._id).select("-password -refreshToken")

  const options = {
    httpOnly: true,  // prevents frontend to modify cookies. Only server can.
    secure: true
  }

  return res
    .status(200).cookie("accessToken", accessToken, options)
    .cookie("refreshToken", refreshToken, options)
    .json(
      new ApiResponse(
        200,
        {
          user: loggedInUser, accessToken,
          refreshToken
        },
        "User logged in successfuly."
      )
    )

})

const logoutUser = asyncHandler(async (req, res) => {
  await User.findByIdAndUpdate(
    req.user._id,
    {
      $set: { //mongodb operator to update fields in objects given
        refreshToken: undefined
      }
    },
    {
      new: true // new is depreciated, alternative is -> returnDocument: 'after'
    }
  )
  const options = {
    httpOnly: true,
    secure: true
  }

  return res
    .status(200)
    .clearCookie("accessToken", options)
    .clearCookie("refreshToken", options)
    .json(new ApiResponse(200, {}, "User logged out."))
})

const refreshAccessToken = asyncHandler(async (req, res) => {
  const incomingRefreshToken = req.cookies.refreshToken || req.body.refreshToken
  if (!incomingRefreshToken) {
    throw new ApiError(401, "Unauthorized request.")
  }
  try {
    const decodedToken = jwt.verify(
      incomingRefreshToken,
      process.env.REFRESH_TOKEN_SECRET
    )
    const user = User.findById(decodedToken?._id)
    if (!user) {
      throw new ApiError(401, "Invalid refresh token")
    }
    if (incomingRefreshToken !== user?.refreshToken) {
      throw new ApiError(401, "Refresh token is expired or used.")
    }

    const options = {
      httpOnly: true,
      secure: true
    }

    const { accessToken, newRefreshToken } = await generateAccessAndRefreshTokens(user._id)

    return res
      .status(200)
      .cookie("accessToken", accessToken, options)
      .cookie("refreshToken", newRefreshToken, options)
      .json(
        new ApiResponse(
          200,
          { accessToken, newRefreshToken },
          "Access token refreshed"
        )
      )
  } catch (error) {
    throw new ApiError(401, error?.message || "Invalid refresh token.")
  }
})

const changeCurrentPassword = asyncHandler(async (req, res) => {
  const { oldPassword, newPassword } = req.body
  const user = await User.findById(req.user?._id)
  const isPasswordCorrect = await user.isPasswordCorrect(oldPassword)
  if (!isPasswordCorrect) {
    throw new ApiError(400, "Invalid old password.")
  }
  user.password = newPassword
  await user.save({ validateBeforeSave: false })

  return res
    .status(200)
    .json(new ApiResponse(200, {}, "Password changed successfuly."))

})

const getCurrentUser = asyncHandler(async (req, res) => {
  return res
    .status(200)
    .json(new ApiResponse(200, req.user, "Current user fetched successfuly."))
})

const updateAccountDetails = asyncHandler(async (req, res) => {
  const { fullname, email } = req.body

  if (!fullname || !email) {
    throw new ApiError(400, "All fields are required.")
  }
  const user = await User.findByIdAndUpdate(
    req.user?._id,
    {
      $set: {
        fullname: fullname,
        email: email
      }
    },
    {new: true}
  ).select("-password")

  return res
    .status(200)
    .json(new ApiResponse(200, user, "Account details updated successfuly."))
})

const updateUserAvatar = asyncHandler(async (req, res) => {
  const avatarLocalPath = req.file?.path

  if (!avatarLocalPath) {
    throw new ApiError(400, "Avatar file is missing.")
  }

  //TODO: delete old image
  const oldAvatar = req.user?.avatar
  const avatar = await uploadOnCloudinary(avatarLocalPath)

  if (!avatar.url) {
    throw new ApiError(400, "Error while uploading avatar.")
  }

  const user = await User.findByIdAndUpdate(
    req.user?._id,
    {
      $set: {
        avatar: avatar.url
      }
    },
    {new: true}
  ).select("-password")

  //call the old avatar delete function
  if (oldAvatar) {
    await deleteFromCloudinary(oldAvatar)
  }
  return res
    .status(200)
    .json(new ApiResponse(200, user, "Avatar updated successfuly."))
})

const updateUserCoverImage = asyncHandler(async (req, res) => {
  const coverImageLocalPath = req.file?.path

  if (!coverImageLocalPath) {
    throw new ApiError(400, "Cover image file is missing.")
  }

  //TODO: delete old image : utility function
  const oldCoverImage = req.user?.coverImage
  const coverImage = await uploadOnCloudinary(coverImageLocalPath)

  if (!coverImage.url) {
    throw new ApiError(400, "Error while uploading cover image.")
  }

  const user = await User.findByIdAndUpdate(
    req.user?._id,
    {
      $set: {
        coverImage: coverImage.url
      }
    },
    {new: true}
  ).select("-password")

  // call the old image delete utility function
  if (oldCoverImage) {
    await deleteFromCloudinary(oldCoverImage)
  }
  return res
    .status(200)
    .json(new ApiResponse(200, user, "Cover image updated successfuly."))
})


export {
  registerUser, loginUser, logoutUser, refreshAccessToken, changeCurrentPassword, getCurrentUser,
  updateAccountDetails, updateUserAvatar, updateUserCoverImage
}
