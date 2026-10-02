import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/ApiError.js";
import {User} from "../models/user.model.js"
import {uploadOnCloudinary} from "../utils/cloudinary.js"
import { ApiResponse } from "../utils/ApiResponse.js";

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

export {registerUser}
