import dbConfig from "../config/db.config.js";
import Sequelize from "sequelize";

const sequelize = new Sequelize(
  dbConfig.DB,
  dbConfig.USER,
  dbConfig.PASSWORD,
  {
    host: dbConfig.HOST,
    dialect: dbConfig.dialect
  }
);

const db = {};

db.Sequelize = Sequelize;
db.sequelize = sequelize;

db.user = (await import("./user.model.js")).default(sequelize, Sequelize);
db.role = (await import("./role.model.js")).default(sequelize, Sequelize);

db.role.belongsToMany(db.user, {
  through: "user_roles"
});

db.user.belongsToMany(db.role, {
  through: "user_roles"
});



db.refreshToken = (await import("./refreshToken.model.js")).default(sequelize, Sequelize);

// relación
db.refreshToken.belongsTo(db.user, {
  foreignKey: 'userId',
  targetKey: 'id'
});

db.user.hasOne(db.refreshToken);



export default db;

