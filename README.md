# PublicPoolUi

This project was generated with [Angular CLI](https://github.com/angular/angular-cli) version 16.0.3.

## Dependencies

Requires [Public-Pool](https://github.com/benjamin-wilson/public-pool) to be running. In this case, Public-Pool is running on Umbrel.

## Find Public-Pool mapping

SSH into Umbrel running Public-Pool and run.
```bash
sudo docker ps | grep public-pool
```

Obtain the image tag for docker-compose that umbrel is using
```bash
Eg. smolgrrr/public-pool-ui:8cd2563
```

Update docker-compose.yml
```bash
services:
  public-pool-ui:
    image: smolgrrr/public-pool-ui:8cd2563
```