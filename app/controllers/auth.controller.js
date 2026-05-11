import db from "../models/index.js";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import dotenv from "dotenv";

dotenv.config();

const User = db.user;
const Role = db.role;

/**
 * Utilidad: respuestas de error consistentes
 */
const errorResponse = (res, status, message, details = null) => {
  return res.status(status).json({
    success: false,
    message,
    ...(details && { details })
  });
};

/**
 * Crear Refresh Token
 */
const createRefreshToken = async (user) => {
  const expiredAt = new Date();
  expiredAt.setDate(expiredAt.getDate() + 1); // 1 día

  const token = jwt.sign({ id: user.id }, process.env.JWT_SECRET);

  return await db.refreshToken.create({
    token: token,
    userId: user.id,
    expiryDate: expiredAt
  });
};

/**
 * Validación básica de email
 */
const isValidEmail = (email) => {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
};

/**
 * 🔹 SIGNUP
 */
export const signup = async (req, res) => {
  const t = await db.sequelize.transaction();
  try {
    const { username, email, password, roles } = req.body || {};

    if (!username || !email || !password) {
      await t.rollback();
      return errorResponse(res, 400, "Faltan campos requeridos");
    }

    if (!isValidEmail(email)) {
      await t.rollback();
      return errorResponse(res, 400, "Email inválido");
    }

    if (password.length < 6) {
      await t.rollback();
      return errorResponse(res, 400, "Password muy corto");
    }

    const exists = await User.findOne({
      where: {
        [db.Sequelize.Op.or]: [{ username }, { email }]
      },
      transaction: t
    });

    if (exists) {
      await t.rollback();
      return errorResponse(res, 400, "Usuario o email ya existe");
    }

    const user = await User.create({
      username,
      email,
      password: bcrypt.hashSync(password, 10)
    }, { transaction: t });

    let rolesToAssign = [];

    if (roles && roles.length > 0) {
      rolesToAssign = await Role.findAll({
        where: { name: roles },
        transaction: t
      });
    } else {
      const role = await Role.findOne({
        where: { name: "user" },
        transaction: t
      });
      rolesToAssign = [role];
    }

    await user.setRoles(rolesToAssign, { transaction: t });

    await t.commit();

    return res.status(201).json({
      success: true,
      message: "Usuario registrado",
      data: {
        id: user.id,
        username: user.username,
        email: user.email,
        roles: rolesToAssign.map(r => r.name)
      }
    });

  } catch (error) {
    await t.rollback();
    return errorResponse(res, 500, "Error en registro", error.message);
  }
};

/**
 * 🔹 SIGNIN
 */
export const signin = async (req, res) => {
  try {
    const { email, password } = req.body || {};

    if (!email || !password) {
      return errorResponse(res, 400, "Email y password requeridos");
    }

    const user = await User.findOne({
      where: { email },
      include: {
        model: Role,
        through: { attributes: [] }
      }
    });

    if (!user) {
      return errorResponse(res, 404, "Usuario no encontrado");
    }

    const validPassword = bcrypt.compareSync(password, user.password);
    if (!validPassword) {
      return errorResponse(res, 401, "Password incorrecto");
    }

    // Access Token
    const accessToken = jwt.sign(
      { id: user.id },
      process.env.JWT_SECRET,
      { expiresIn: "1m" } // corto para pruebas
    );

    // Refresh Token
    const refreshToken = await createRefreshToken(user);

    const authorities = user.roles?.map(r => r.name) || [];

    return res.status(200).json({
      success: true,
      message: "Login exitoso",
      data: {
        id: user.id,
        username: user.username,
        email: user.email,
        roles: authorities,
        accessToken: accessToken,
        refreshToken: refreshToken.token
      }
    });

  } catch (error) {
    return errorResponse(res, 500, "Error en login", error.message);
  }
};

/**
 * 🔹 REFRESH TOKEN
 */
export const refreshToken = async (req, res) => {
  const { refreshToken } = req.body;

  if (!refreshToken) {
    return res.status(403).json({ message: "Refresh Token requerido" });
  }

  try {
    const token = await db.refreshToken.findOne({
      where: { token: refreshToken }
    });

    if (!token) {
      return res.status(403).json({ message: "Refresh Token no válido" });
    }

    if (new Date() > token.expiryDate) {
      return res.status(403).json({ message: "Refresh Token expirado" });
    }

    const user = await User.findByPk(token.userId);

    const newAccessToken = jwt.sign(
      { id: user.id },
      process.env.JWT_SECRET,
      { expiresIn: "1m" }
    );

    return res.json({
      accessToken: newAccessToken
    });

  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};