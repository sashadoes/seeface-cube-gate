import { Request, Response } from "express";

export default (request: Request, response: Response) => {
  const { body } = request;
  // Validate the comment data
  if (!body.email) {
    throw new Error("Email is required");
  }
};
