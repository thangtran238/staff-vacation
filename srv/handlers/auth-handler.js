const cds = require("@sap/cds");
const bcrypt = require("bcryptjs");
const {
  generateAccessToken,
  generateRefreshToken,
  verifyAccessToken,
  verifyRefreshToken,
} = require("../helpers/jwt");
const { Users } = cds.entities;

const authHandler = {
  login: async (req) => {
    try {
      const user = await SELECT.from(Users).where({
        username: req.data.username,
      });
      if (!user || user.length !== 1)
        return req.reject(401, "Invalid username or password");

      if (!(await bcrypt.compare(req.data.password,user[0].password))) {
        return req.reject(401, "Invalid password");
      }
      const accessToken = generateAccessToken(user[0]);
      const refreshToken = generateRefreshToken(user[0]);

      const updatedUser = await UPDATE(Users)
        .where({ ID: user[0].ID })
        .set({ refreshToken: refreshToken });
      if (!updatedUser) {
        return req.reject(500, "Failed to update the user's token.");
      }
      return req.info(200, accessToken);
    } catch (error) {
      req.reject(500, error.message);
    }
  },

  signup: async (req) => {
    try {
      const user = await SELECT.from(Users).where({
        username: req.data.username,
      });

      if (user.length > 0)
        return req.reject(400, "This username is already existed");

      const salt = await bcrypt.genSalt(10);
      const hashedPassword = await bcrypt.hash(req.data.password, salt);

      await INSERT.into(Users).entries({
        fullName: req.data.fullName,
        address: req.data.address,
        username: req.data.username,
        password: hashedPassword,
        role: req.data.role ? req.data.role : "staff",
      });
      const newUser = await SELECT.one
        .from(Users)
        .where({ username: req.data.username });
      if (!newUser) {
        return req.reject(
          500,
          "Failed to retrieve user information after signup."
        );
      }
      await calculateVacationDays(newUser.ID);
      req.results = {
        code: 201,
        message: "Welcome to the system!",
      };
    } catch (error) {
      req.reject(500, error.message);
    }
  },
  refresh: async (req) => {
    const decodedAccessToken = verifyAccessToken(req.headers.authorization);
    if (decodedAccessToken.exp)
      return req.reject(400, "This access token is useable");

    const user = await SELECT.one
      .from(Users)
      .where({ ID: decodedAccessToken.id });
    console.log(user);
    if (!user) return req.reject(404, "Couldn't find this user!");

    const decodedRefreshToken = verifyRefreshToken(user.refreshToken);
    console.log(decodedRefreshToken);

    if (!decodedRefreshToken.exp)
      return req.reject(300, "Your token is on expiry, try login again!!");

    const newAccessToken = generateAccessToken(user);

    if (!newAccessToken)
      return req.reject(500, "Cannot create new access token!");

    req.results = {
      code: 200,
      data: newAccessToken,
    };
  },
  logout: async (req) => {
    const decoded = verifyAccessToken(req.headers.authorization);

    await UPDATE(Users).where({ ID: decoded.id }).set({ refreshToken: null });
  },
};

const calculateVacationDays = async (user_id) => {
  try {
    const user = await SELECT.one.from(Users).where({ ID: user_id });
    const createdAt = new Date(user.createdAt);
    const currentYear = new Date().getFullYear();
    if (createdAt.getFullYear() === currentYear) {
      const endOfYear = new Date(currentYear, 11, 31);
      const monthsPassed = endOfYear.getMonth() - createdAt.getMonth();
      const dayOffThisYear = monthsPassed * 1.25;
      await UPDATE(Users)
        .set({ dayOffThisYear: dayOffThisYear })
        .where({ ID: user_id });
    }
  } catch (error) {
    return { code: 500, message: error.message || "Internal Server Error" };
  }
};

module.exports = authHandler;
