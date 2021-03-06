import argon2 from "argon2";
import { MyContext } from "src/types";
import {
  Arg,
  Ctx,
  Field,
  InputType,
  Mutation,
  ObjectType,
  Query,
  Resolver,
} from "type-graphql";

import { User } from "../entities/User";

// this so we can add anything to the session object in req:Request.
declare module "express-session" {
  interface SessionData {
    [key: string]: any;
  }
}

@InputType()
class UsernamePasswordInput {
  @Field()
  username: string;

  @Field()
  password: string;
}

@ObjectType()
class FieldError {
  @Field()
  field: string;
  @Field()
  message: string;
}

@ObjectType()
class UserResponse {
  @Field(() => [FieldError], { nullable: true })
  errors?: FieldError[];

  @Field(() => User, { nullable: true })
  user?: User;
}

@Resolver()
export class userResolver {
  @Query(() => User, { nullable: true })
  async me(@Ctx() { req, em }: MyContext): Promise<User | null> {
    console.log(req.session);
    if (!req.session.userId) {
      return null;
    }

    const user = await em.findOne(User, { id: req.session.userId });

    return user;
  }

  @Mutation(() => UserResponse)
  async register(
    @Arg("options") options: UsernamePasswordInput,
    @Ctx() { em, req }: MyContext
  ): Promise<UserResponse> {
    //validate for the username
    if (options.username.length <= 2) {
      return {
        errors: [
          {
            field: "username",
            message: "length must be greater than 2",
          },
        ],
      };
    }

    //validate for the password
    if (options.password.length <= 5) {
      return {
        errors: [
          {
            field: "password",
            message: "length must be greater than 5",
          },
        ],
      };
    }

    //hashing password
    const hashedPassword = await argon2.hash(options.password);

    //creating user instance
    const user = em.create(User, {
      username: options.username,
      password: hashedPassword,
    });

    // duplicate username error
    try {
      //saving the user in DB.
      await em.persistAndFlush(user);
    } catch (error) {
      if (error.code === "23505" || error.detail.includes("already exists")) {
        return {
          errors: [
            {
              field: "username",
              message: "username already taken",
            },
          ],
        };
      }
      console.log(error);
    }

    //this will set cookie right after successfull account creatation
    //will keep user loggedin
    req.session.userId = user.id;

    return { user };
  }

  @Mutation(() => UserResponse)
  async login(
    @Arg("options") options: UsernamePasswordInput,
    @Ctx() { em, req }: MyContext
  ): Promise<UserResponse> {
    const user = await em.findOne(User, { username: options.username });
    if (!user) {
      return {
        errors: [{ field: "username", message: "that username dosen't exist" }],
      };
    }

    const valid = await argon2.verify(user.password, options.password);

    if (!valid) {
      return {
        errors: [
          {
            field: "password",
            message: "incorrect passowrd",
          },
        ],
      };
    }

    req.session.userId = user.id;

    return {
      user,
    };
  }
}
