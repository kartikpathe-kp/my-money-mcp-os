declare module "splitwise" {
  type SplitwiseConfig = {
    consumerKey: string;
    consumerSecret: string;
    accessToken?: string;
    logLevel?: "none" | "error" | "warn" | "info" | "debug";
  };

  // Keep this loose but useful: you can refine later as you touch endpoints.
  type SplitwiseClient = {
    getCurrentUser(): Promise<any>;
    getFriends(args?: any): Promise<any[]>;
    getFriend(args: any): Promise<any>;
    getGroups(args?: any): Promise<any[]>;
    getGroup(args: any): Promise<any>;
    getExpenses(args?: any): Promise<any[]>;
    getExpense(args: any): Promise<any>;
    createExpense(args: any): Promise<any>;
    updateExpense(args: any): Promise<any>;
    deleteExpense(args: any): Promise<any>;
    createDebt(args: any): Promise<any>;
    getCategories(): Promise<any>;
    getCurrencies(): Promise<any>;
    getNotifications(args?: any): Promise<any>;
  };

  export default function Splitwise(config: SplitwiseConfig): SplitwiseClient;
}
