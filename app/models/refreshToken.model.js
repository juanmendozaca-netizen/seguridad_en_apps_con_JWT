export default (sequelize, Sequelize) => {
  return sequelize.define("refreshToken", {
    token: {
      type: Sequelize.STRING
    },
    expiryDate: {
      type: Sequelize.DATE
    }
  });
};