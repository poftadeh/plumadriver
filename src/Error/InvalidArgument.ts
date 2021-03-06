import { BadRequest } from './BadRequest';

export class InvalidArgument extends BadRequest {
  constructor() {
    super()
    this.message = `The arguments passed to ${this.command} are either invalid or malformed`;
    this.name = 'InvalidArgumentError';
    this.JSONCodeError = 'invalid argument';
  }
}
