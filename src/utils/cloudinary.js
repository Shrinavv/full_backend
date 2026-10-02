import {v2 as cloudinary} from "cloudinary"
import fs from "fs"

cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET
});

const uploadOnCloudinary = async (localFilePath) => {
    try{
        if(!localFilePath) return null
        const response = await cloudinary.uploader.upload(localFilePath, {
            resource_type: "auto"
        })
        // console.log("file is uploaded on cloudinary ", response.url);
        fs.unlinkSync(localFilePath) //remove the locally saved temporary file, as it was kept only for testing.
        return response;
    } catch(error){
        fs.unlinkSync(localFilePath) //remove the locally saved temporary file as the upload operation got failed
        return null;
    }
}

const deleteFromCloudinary = async (publicIdOrUrl, resourceType = "image") => {
  try {
    if (!publicIdOrUrl) return null;

    // Extract public ID if full URL is passed
    let publicId = publicIdOrUrl;
    if (publicIdOrUrl.startsWith("http://") || publicIdOrUrl.startsWith("https://")) {
      const urlSegments = publicIdOrUrl.split("/");
      const filename = urlSegments.pop(); // e.g. "sample_id.png"
      publicId = filename.split(".")[0];  // e.g. "sample_id"
    }

    const response = await cloudinary.uploader.destroy(publicId, {
      resource_type: resourceType
    });

    return response;
  } catch (error) {
    console.error("Error deleting file from Cloudinary:", error);
    return null;
  }
}

//cloudinary.v2.uploader.upload("path/to/file")

export { uploadOnCloudinary, deleteFromCloudinary }
